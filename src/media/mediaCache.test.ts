import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '../domain/asset';
import { createMediaCache, type MediaCacheDependencies } from './mediaCache';

/** A stand-in for ImageBitmap: size comes from the blob's text, e.g. "100x50". */
class FakeImage {
  closed = false;
  constructor(
    readonly width: number,
    readonly height: number,
    readonly label: string,
  ) {}
  close() {
    this.closed = true;
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function asset(id: string, kind: Asset['kind'] = 'image'): Asset {
  return {
    id,
    projectId: 'p',
    kind,
    mime: kind === 'video' ? 'video/mp4' : 'image/png',
    filename: `${id}.bin`,
    bytes: 1,
    createdAt: 1,
    ...(kind === 'video' ? { durationMs: 2000 } : {}),
  };
}

function setup(
  library: Record<string, { asset: Asset; file?: string; thumb?: string }>,
  options: Parameters<typeof createMediaCache>[1] = {},
) {
  const decoded: FakeImage[] = [];
  const deps: MediaCacheDependencies<FakeImage & CanvasImageSource> = {
    getAsset: vi.fn(async (id: string) => library[id]?.asset),
    readFile: vi.fn(async (id: string) => (library[id]?.file ? new Blob([library[id].file]) : undefined)),
    readThumbnail: vi.fn(async (id: string) => (library[id]?.thumb ? new Blob([library[id].thumb]) : undefined)),
    decodeImage: vi.fn(async (blob: Blob) => {
      const text = await blob.text();
      if (text === 'corrupt') throw new Error('decode failed');
      const [w, h] = text.split('x').map(Number);
      const image = new FakeImage(w ?? 1, h ?? 1, text);
      decoded.push(image);
      return image as FakeImage & CanvasImageSource;
    }),
  };
  const cache = createMediaCache(deps, options);
  const redraws = vi.fn();
  cache.subscribe(redraws);
  return { cache, deps, decoded, redraws };
}

describe('mediaCache', () => {
  it('answers undefined first, then the decoded image after redraw requests', async () => {
    const { cache, redraws } = setup({ a: { asset: asset('a'), file: '400x300', thumb: '40x30' } });
    expect(cache.preview.frame('a', 0)).toBeUndefined();
    // Like the preview: every redraw request leads to another draw.
    for (let i = 0; i < 5; i += 1) {
      await flush();
      cache.preview.frame('a', 0);
    }
    expect(redraws).toHaveBeenCalled();
    expect(cache.preview.frame('a', 0)).toMatchObject({ width: 400, height: 300, kind: 'image' });
  });

  it('shows the thumbnail while the full image is still decoding', async () => {
    const { cache, deps } = setup({ a: { asset: asset('a'), file: '400x300', thumb: '40x30' } });
    let finishFull!: () => void;
    const original = deps.readFile;
    deps.readFile = vi.fn(async (id: string) => {
      await new Promise<void>((resolve) => (finishFull = resolve));
      return original(id);
    });
    cache.preview.frame('a', 0);
    await flush();
    cache.preview.frame('a', 0); // asset known now: starts full + thumbnail loads
    await flush();
    await flush();
    expect(cache.preview.frame('a', 0)).toMatchObject({ width: 40 });
    finishFull();
    await flush();
    await flush();
    expect(cache.preview.frame('a', 0)).toMatchObject({ width: 400 });
  });

  it('treats unknown assets, missing files and corrupt images as missing (no retry storm)', async () => {
    const { cache, deps } = setup({ b: { asset: asset('b') }, c: { asset: asset('c'), file: 'corrupt' } });
    for (let i = 0; i < 3; i += 1) {
      for (const id of ['zzz', 'b', 'c']) expect(cache.preview.frame(id, 0)).toBeUndefined();
      await flush();
      await flush();
    }
    expect(deps.getAsset).toHaveBeenCalledTimes(3);
    expect(deps.decodeImage).toHaveBeenCalledTimes(1);
  });

  it('evicts least-recently-used images beyond the pixel budget and closes them', async () => {
    const { cache, decoded } = setup(
      {
        a: { asset: asset('a'), file: '100x100' },
        b: { asset: asset('b'), file: '100x100' },
        c: { asset: asset('c'), file: '100x100' },
      },
      { maxImagePixels: 25_000 },
    );
    for (const id of ['a', 'b', 'c']) {
      cache.beginFrame();
      cache.preview.frame(id, 0);
      await flush();
      cache.beginFrame();
      cache.preview.frame(id, 0);
      await flush();
      await flush();
    }
    expect(cache.stats().imagePixels).toBeLessThanOrEqual(25_000);
    expect(decoded.find((d) => d.label === '100x100' && d.closed)).toBeDefined();
    expect(cache.preview.frame('c', 0)).toBeDefined(); // the most recent survives
  });

  it('release frees memory and forgets the asset; a load finishing afterwards is dropped', async () => {
    const { cache, decoded } = setup({ a: { asset: asset('a'), file: '10x10' }, b: { asset: asset('b'), file: '20x20' } });
    cache.preview.frame('a', 0);
    cache.preview.frame('b', 0);
    await flush();
    cache.preview.frame('a', 0);
    cache.preview.frame('b', 0); // both decoding now
    cache.release('a');
    await flush();
    await flush();
    expect(decoded.find((d) => d.label === '10x10')?.closed).toBe(true);
    // Releasing one asset must not strand the other's load.
    expect(cache.preview.frame('b', 0)).toMatchObject({ width: 20 });
    expect(cache.stats().images).toBe(1);
  });

  it('without video support, clips show their poster thumbnail', async () => {
    const { cache } = setup({ v: { asset: asset('v', 'video'), file: 'video-bytes', thumb: '48x27' } });
    cache.preview.frame('v', 500);
    await flush();
    cache.preview.frame('v', 500);
    await flush();
    await flush();
    expect(cache.preview.frame('v', 500)).toMatchObject({ width: 48, kind: 'video' });
  });

  it('the thumbnails resolver uses only thumbnails and bumps its own version', async () => {
    const { cache, deps } = setup({ a: { asset: asset('a'), file: '400x300', thumb: '40x30' } });
    const listener = vi.fn();
    cache.subscribeThumbnails(listener);
    const before = cache.thumbnailVersion();
    cache.thumbnails.frame('a', 0);
    await flush();
    cache.thumbnails.frame('a', 0);
    await flush();
    await flush();
    expect(cache.thumbnails.frame('a', 0)).toMatchObject({ width: 40 });
    expect(cache.thumbnailVersion()).toBeGreaterThan(before);
    expect(listener).toHaveBeenCalled();
    expect(deps.readFile).not.toHaveBeenCalled();
  });

  it('never decodes audio assets as pictures', async () => {
    const { cache, deps } = setup({ m: { asset: { ...asset('m'), kind: 'audio', mime: 'audio/mpeg' }, file: 'mp3-bytes', thumb: '1x1' } });
    for (let i = 0; i < 3; i += 1) {
      expect(cache.preview.frame('m', 0)).toBeUndefined();
      expect(cache.thumbnails.frame('m', 0)).toBeUndefined();
      await flush();
    }
    expect(deps.decodeImage).not.toHaveBeenCalled();
    expect(deps.readFile).not.toHaveBeenCalled();
  });

  it('releaseAll closes everything', async () => {
    const { cache, decoded } = setup({ a: { asset: asset('a'), file: '10x10', thumb: '2x2' } });
    cache.preview.frame('a', 0);
    await flush();
    cache.preview.frame('a', 0);
    await flush();
    await flush();
    cache.releaseAll();
    expect(decoded.every((d) => d.closed)).toBe(true);
    expect(cache.stats()).toEqual({ images: 0, imagePixels: 0, thumbnails: 0, videos: 0, audibleVideos: 0 });
  });
});
