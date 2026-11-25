import type { Asset } from '../domain/asset';
import type { MediaFrame, MediaResolver } from '../render/media';

/**
 * Decoded media for the live preview and the scene thumbnails.
 *
 * `renderFrame` is synchronous, so resolvers answer with what is ready *now* and start loading
 * what isn't; when something finishes, listeners are told so the canvas can redraw.
 *
 * - Images: full-size `ImageBitmap`s, decoded on first use, kept in an LRU bounded by pixel count
 *   and `close()`d on eviction. Until the full image is ready, the small thumbnail stands in.
 * - Video: one muted `<video>` per clip (bounded pool). While the preview is paused the element is
 *   seeked to the exact time; while playing it plays along and is only re-seeked when it drifts.
 * - Thumbnails resolver (scene strip): stored WebP thumbnails only, never the video elements, so
 *   thumbnails don't fight the preview over seeking. It has its own change channel.
 */

export interface DecodedImage {
  width: number;
  height: number;
  close(): void;
}

export interface MediaCacheDependencies<I extends DecodedImage = ImageBitmap> {
  getAsset(id: string): Promise<Asset | undefined>;
  readFile(id: string): Promise<Blob | undefined>;
  readThumbnail(id: string): Promise<Blob | undefined>;
  decodeImage(blob: Blob): Promise<I>;
  /** Browser only; without it videos fall back to their poster thumbnail. */
  createVideo?: () => HTMLVideoElement;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

export interface MediaCacheOptions {
  /** Pixel budget for full-size images (each pixel ≈ 4 bytes of memory). */
  maxImagePixels?: number;
  maxThumbnailPixels?: number;
  maxVideos?: number;
}

type Slot<T> = { state: 'loading' } | { state: 'ready'; value: T } | { state: 'missing' };

interface ImageEntry<I> {
  slot: Slot<I>;
  lastUsed: number;
}

interface VideoEntry {
  element?: HTMLVideoElement;
  url?: string;
  ready: boolean;
  failed: boolean;
  durationMs: number;
  lastUsed: number;
}

/** Seek tolerance while paused (about a frame) and allowed drift while playing. */
const PAUSED_TOLERANCE_S = 1 / 60;
const PLAYING_DRIFT_S = 0.25;
/** Keep the target strictly inside the clip so `ended` never resets playback to 0. */
const END_GUARD_S = 0.05;

class ImageLru<I extends DecodedImage> {
  readonly entries = new Map<string, ImageEntry<I>>();
  constructor(private readonly maxPixels: number) {}

  pixels(): number {
    let total = 0;
    for (const entry of this.entries.values()) {
      if (entry.slot.state === 'ready') total += entry.slot.value.width * entry.slot.value.height;
    }
    return total;
  }

  /** Close least-recently-used images until within budget, sparing those used this frame. */
  trim(protectedSince: number): void {
    let total = this.pixels();
    if (total <= this.maxPixels) return;
    const candidates = [...this.entries.entries()]
      .filter(([, e]) => e.slot.state === 'ready' && e.lastUsed < protectedSince)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [id, entry] of candidates) {
      if (total <= this.maxPixels) break;
      if (entry.slot.state !== 'ready') continue;
      total -= entry.slot.value.width * entry.slot.value.height;
      entry.slot.value.close();
      this.entries.delete(id);
    }
  }

  release(id: string): void {
    const entry = this.entries.get(id);
    if (entry?.slot.state === 'ready') entry.slot.value.close();
    this.entries.delete(id);
  }
}

export function createMediaCache<I extends DecodedImage & CanvasImageSource = ImageBitmap>(
  deps: MediaCacheDependencies<I>,
  options: MediaCacheOptions = {},
) {
  const assets = new Map<string, Slot<Asset>>();
  const full = new ImageLru<I>(options.maxImagePixels ?? 48_000_000);
  const thumbs = new ImageLru<I>(options.maxThumbnailPixels ?? 12_000_000);
  const videos = new Map<string, VideoEntry>();
  const maxVideos = options.maxVideos ?? 4;

  const previewListeners = new Set<() => void>();
  const thumbListeners = new Set<() => void>();
  let thumbVersion = 0;
  let clock = 0; // logical time for LRU
  let frameStart = 0;
  let playing = false;
  let touchedVideos = new Set<string>();

  const notifyPreview = () => previewListeners.forEach((listener) => listener());
  const notifyThumbs = () => {
    thumbVersion += 1;
    thumbListeners.forEach((listener) => listener());
  };
  const notifyAll = () => {
    notifyPreview();
    notifyThumbs();
  };

  function assetFor(id: string): Asset | undefined {
    const slot = assets.get(id);
    if (slot) return slot.state === 'ready' ? slot.value : undefined;
    const loading: Slot<Asset> = { state: 'loading' };
    assets.set(id, loading);
    void deps
      .getAsset(id)
      .catch(() => undefined)
      .then((asset) => {
        if (assets.get(id) !== loading) return; // released meanwhile
        assets.set(id, asset ? { state: 'ready', value: asset } : { state: 'missing' });
        notifyAll();
      });
    return undefined;
  }

  function imageFrom(lru: ImageLru<I>, id: string, load: () => Promise<Blob | undefined>, onReady: () => void): I | undefined {
    clock += 1;
    const entry = lru.entries.get(id);
    if (entry) {
      entry.lastUsed = clock;
      return entry.slot.state === 'ready' ? entry.slot.value : undefined;
    }
    const created: ImageEntry<I> = { slot: { state: 'loading' }, lastUsed: clock };
    lru.entries.set(id, created);
    void (async () => {
      let slot: Slot<I>;
      try {
        const blob = await load();
        slot = blob ? { state: 'ready', value: await deps.decodeImage(blob) } : { state: 'missing' };
      } catch {
        slot = { state: 'missing' };
      }
      if (lru.entries.get(id) !== created) {
        // Released meanwhile: don't resurrect it.
        if (slot.state === 'ready') slot.value.close();
        return;
      }
      created.slot = slot;
      lru.trim(frameStart);
      onReady();
    })();
    return undefined;
  }

  const fullImage = (id: string) => imageFrom(full, id, () => deps.readFile(id), notifyPreview);
  const thumbImage = (id: string) => imageFrom(thumbs, id, () => deps.readThumbnail(id), notifyAll);

  const asFrame = (image: I, kind: Asset['kind']): MediaFrame => ({ source: image, width: image.width, height: image.height, kind });

  // ---------- video ----------

  function evictVideos(): void {
    if (videos.size <= maxVideos) return;
    const victims = [...videos.entries()]
      .filter(([id]) => !touchedVideos.has(id))
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [id] of victims) {
      if (videos.size <= maxVideos) break;
      releaseVideo(id);
    }
  }

  function releaseVideo(id: string): void {
    const entry = videos.get(id);
    if (!entry) return;
    if (entry.element) {
      entry.element.pause();
      entry.element.removeAttribute('src');
      entry.element.load();
    }
    if (entry.url) deps.revokeObjectURL?.(entry.url);
    videos.delete(id);
  }

  function startVideo(id: string, asset: Asset): VideoEntry {
    const entry: VideoEntry = { ready: false, failed: false, durationMs: asset.durationMs ?? 0, lastUsed: clock };
    videos.set(id, entry);
    evictVideos();
    void deps
      .readFile(id)
      .catch(() => undefined)
      .then((file) => {
        if (videos.get(id) !== entry) return; // released meanwhile
        if (!file || !deps.createVideo || !deps.createObjectURL) {
          entry.failed = true;
          notifyPreview();
          return;
        }
        const element = deps.createVideo();
        element.muted = true;
        element.playsInline = true;
        element.preload = 'auto';
        element.addEventListener('loadeddata', () => {
          entry.ready = true;
          if (Number.isFinite(element.duration)) entry.durationMs = element.duration * 1000;
          notifyPreview();
        });
        element.addEventListener('seeked', () => {
          if (!playing) notifyPreview();
        });
        element.addEventListener('error', () => {
          entry.failed = true;
          notifyPreview();
        });
        entry.element = element;
        entry.url = deps.createObjectURL(file);
        element.src = entry.url;
      });
    return entry;
  }

  function videoFrame(id: string, asset: Asset, clipTimeMs: number): MediaFrame | undefined {
    clock += 1;
    touchedVideos.add(id);
    const entry = videos.get(id) ?? startVideo(id, asset);
    entry.lastUsed = clock;
    const element = entry.element;
    if (!element || !entry.ready || entry.failed) {
      // Poster thumbnail until the clip can show a real frame.
      const poster = thumbImage(id);
      return poster ? asFrame(poster, 'video') : undefined;
    }

    const durationS = entry.durationMs / 1000;
    const lastS = Math.max(0, durationS - END_GUARD_S);
    const target = Math.min(Math.max(0, clipTimeMs / 1000), lastS);
    const atEnd = target >= lastS;

    if (playing && !atEnd) {
      if (element.paused) {
        if (Math.abs(element.currentTime - target) > PAUSED_TOLERANCE_S) element.currentTime = target;
        void element.play().catch(() => undefined);
      } else if (Math.abs(element.currentTime - target) > PLAYING_DRIFT_S) {
        element.currentTime = target;
      }
    } else {
      if (!element.paused) element.pause();
      if (!element.seeking && Math.abs(element.currentTime - target) > PAUSED_TOLERANCE_S) element.currentTime = target;
    }
    return { source: element, width: element.videoWidth, height: element.videoHeight, kind: 'video' };
  }

  // ---------- resolvers ----------

  const preview: MediaResolver = {
    frame(assetId, clipTimeMs) {
      const asset = assetFor(assetId);
      // Audio has no pixels; a template asking for it gets nothing (and nothing is decoded).
      if (!asset || asset.kind === 'audio') return undefined;
      if (asset.kind === 'video') return videoFrame(assetId, asset, clipTimeMs);
      const image = fullImage(assetId);
      if (image) return asFrame(image, asset.kind);
      const thumb = thumbImage(assetId);
      return thumb ? asFrame(thumb, asset.kind) : undefined;
    },
  };

  const thumbnails: MediaResolver = {
    frame(assetId) {
      const asset = assetFor(assetId);
      if (!asset || asset.kind === 'audio') return undefined;
      const thumb = thumbImage(assetId);
      return thumb ? asFrame(thumb, asset.kind) : undefined;
    },
  };

  return {
    preview,
    thumbnails,

    /** Call around each preview `renderFrame`: clips not drawn in this frame get paused. */
    beginFrame(): void {
      frameStart = clock + 1;
      touchedVideos = new Set();
    },
    endFrame(): void {
      for (const [id, entry] of videos) {
        if (!touchedVideos.has(id) && entry.element && !entry.element.paused) entry.element.pause();
      }
      evictVideos();
    },

    /** Preview playback state: clips play along while playing, and seek exactly while paused. */
    setPlaying(next: boolean): void {
      playing = next;
    },

    /** Preview redraw requests (an image decoded, a clip seeked). */
    subscribe(listener: () => void): () => void {
      previewListeners.add(listener);
      return () => previewListeners.delete(listener);
    },
    /** Thumbnail changes, for `useSyncExternalStore`. */
    subscribeThumbnails(listener: () => void): () => void {
      thumbListeners.add(listener);
      return () => thumbListeners.delete(listener);
    },
    thumbnailVersion: () => thumbVersion,

    /** Forget an asset (e.g. deleted) and free its memory. */
    release(id: string): void {
      assets.delete(id);
      full.release(id);
      thumbs.release(id);
      releaseVideo(id);
      notifyAll();
    },
    releaseAll(): void {
      for (const id of [...full.entries.keys()]) full.release(id);
      for (const id of [...thumbs.entries.keys()]) thumbs.release(id);
      for (const id of [...videos.keys()]) releaseVideo(id);
      assets.clear();
      notifyAll();
    },

    /** For tests and diagnostics. */
    stats: () => ({ images: full.entries.size, imagePixels: full.pixels(), thumbnails: thumbs.entries.size, videos: videos.size }),
  };
}

export type MediaCache = ReturnType<typeof createMediaCache>;
