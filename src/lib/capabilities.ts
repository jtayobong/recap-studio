/**
 * Browser capability detection.
 *
 * "core" capabilities are needed to use the app at all (local storage of projects and media).
 * "export" capabilities are needed to render an MP4/WebM (milestone 5). If they are missing,
 * the user can still edit, but sees a warning that export won't work in this browser.
 */

export type CapabilityGroup = 'core' | 'export';

export interface CapabilityResult {
  id: string;
  label: string;
  group: CapabilityGroup;
  ok: boolean;
  /** Why it matters, in plain language. */
  neededFor: string;
}

export interface ExportTarget {
  container: 'mp4' | 'webm';
  videoCodec: string;
  audioCodec: string;
  label: string;
}

export interface CapabilityReport {
  results: CapabilityResult[];
  coreOk: boolean;
  exportOk: boolean;
  /** Best export container/codec combination this browser can encode, if any. */
  exportTarget: ExportTarget | null;
  checkedAt: number;
}

/** The subset of the global scope we probe. Injectable for tests. */
export interface CapabilityEnv {
  isSecureContext?: boolean;
  indexedDB?: unknown;
  navigator?: { storage?: { getDirectory?: () => Promise<unknown> } };
  Worker?: unknown;
  OffscreenCanvas?: unknown;
  OfflineAudioContext?: unknown;
  VideoFrame?: unknown;
  VideoEncoder?: {
    isConfigSupported(config: VideoEncoderConfig): Promise<{ supported?: boolean }>;
  };
  AudioEncoder?: {
    isConfigSupported(config: AudioEncoderConfig): Promise<{ supported?: boolean }>;
  };
}

/** Probe settings match the default export at 30 fps, in both enabled shapes (9:16 and 16:9). */
const PROBE_SIZES = [
  { width: 1080, height: 1920 },
  { width: 1920, height: 1080 },
] as const;
const PROBE_VIDEO = { bitrate: 8_000_000, framerate: 30 } as const;
const PROBE_AUDIO = { sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000 } as const;

export const CODECS = {
  /** H.264 High profile, level 4.0 (fits 1080×1920 and 1920×1080 @ 30 fps). */
  h264: 'avc1.640028',
  vp9: 'vp09.00.40.08',
  aac: 'mp4a.40.2',
  opus: 'opus',
} as const;

/** True when the encoder accepts `codec` at every probe size (a story can be either shape). */
async function canEncodeVideo(env: CapabilityEnv, codec: string): Promise<boolean> {
  const encoder = env.VideoEncoder;
  if (!encoder) return false;
  try {
    const results = await Promise.all(PROBE_SIZES.map((size) => encoder.isConfigSupported({ codec, ...size, ...PROBE_VIDEO })));
    return results.every((result) => result.supported === true);
  } catch {
    return false;
  }
}

async function canEncodeAudio(env: CapabilityEnv, codec: string): Promise<boolean> {
  if (!env.AudioEncoder) return false;
  try {
    const result = await env.AudioEncoder.isConfigSupported({ codec, ...PROBE_AUDIO });
    return result.supported === true;
  } catch {
    return false;
  }
}

async function hasOpfs(env: CapabilityEnv): Promise<boolean> {
  const getDirectory = env.navigator?.storage?.getDirectory;
  if (typeof getDirectory !== 'function') return false;
  try {
    await getDirectory.call(env.navigator?.storage);
    return true;
  } catch {
    return false;
  }
}

export async function checkCapabilities(
  env: CapabilityEnv = globalThis as unknown as CapabilityEnv,
  now: () => number = Date.now,
): Promise<CapabilityReport> {
  const webCodecs = Boolean(env.VideoEncoder && env.AudioEncoder && env.VideoFrame);

  const [opfs, h264, vp9, aac, opus] = await Promise.all([
    hasOpfs(env),
    canEncodeVideo(env, CODECS.h264),
    canEncodeVideo(env, CODECS.vp9),
    canEncodeAudio(env, CODECS.aac),
    canEncodeAudio(env, CODECS.opus),
  ]);

  let exportTarget: ExportTarget | null = null;
  if (h264 && aac) {
    exportTarget = { container: 'mp4', videoCodec: CODECS.h264, audioCodec: CODECS.aac, label: 'MP4 (H.264 + AAC)' };
  } else if (vp9 && opus) {
    exportTarget = { container: 'webm', videoCodec: CODECS.vp9, audioCodec: CODECS.opus, label: 'WebM (VP9 + Opus)' };
  }

  const results: CapabilityResult[] = [
    {
      id: 'secureContext',
      label: 'Secure context (localhost or HTTPS)',
      group: 'core',
      ok: env.isSecureContext === true,
      neededFor: 'Browsers only enable file storage and media encoders on secure origins.',
    },
    {
      id: 'indexedDB',
      label: 'IndexedDB',
      group: 'core',
      ok: Boolean(env.indexedDB),
      neededFor: 'Saving your projects locally.',
    },
    {
      id: 'opfs',
      label: 'Origin Private File System',
      group: 'core',
      ok: opfs,
      neededFor: 'Storing imported photos, clips and music on this computer.',
    },
    {
      id: 'workers',
      label: 'Web Workers',
      group: 'core',
      ok: typeof env.Worker === 'function',
      neededFor: 'Doing heavy work without freezing the editor.',
    },
    {
      id: 'webCodecs',
      label: 'WebCodecs',
      group: 'export',
      ok: webCodecs,
      neededFor: 'Hardware-accelerated video encoding for export.',
    },
    {
      id: 'offscreenCanvas',
      label: 'OffscreenCanvas',
      group: 'export',
      ok: typeof env.OffscreenCanvas === 'function',
      neededFor: 'Rendering frames in a background worker during export.',
    },
    {
      id: 'offlineAudio',
      label: 'Offline audio rendering',
      group: 'export',
      ok: typeof env.OfflineAudioContext === 'function',
      neededFor: 'Mixing the music track into the exported video.',
    },
    {
      id: 'encoder',
      label: exportTarget ? `Encoder: ${exportTarget.label}` : 'Encoder: MP4 or WebM',
      group: 'export',
      ok: exportTarget !== null,
      neededFor: 'Encoding a 1080×1920 video with audio.',
    },
  ];

  const okFor = (group: CapabilityGroup) => results.filter((r) => r.group === group).every((r) => r.ok);

  return {
    results,
    coreOk: okFor('core'),
    exportOk: okFor('export'),
    exportTarget,
    checkedAt: now(),
  };
}
