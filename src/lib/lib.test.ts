import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkCapabilities, CODECS, type CapabilityEnv } from './capabilities';
import { debounce } from './debounce';
import { formatAspectRatio, formatBytes, formatDuration, formatRelativeTime } from './format';

describe('debounce', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls once with the latest arguments', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced(1);
    debounced(2);
    expect(debounced.pending()).toBe(true);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2);
    expect(debounced.pending()).toBe(false);
  });

  it('flush runs immediately; cancel drops the call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a');
    debounced.flush();
    expect(fn).toHaveBeenCalledWith('a');

    debounced('b');
    debounced.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
    debounced.flush(); // nothing pending: no call
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('format helpers', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
    expect(formatBytes(-1)).toBe('—');
  });

  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_400)).toBe('1:05');
    expect(formatDuration(5 * 60_000)).toBe('5:00');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('formats relative time', () => {
    const now = 1_000_000_000;
    expect(formatRelativeTime(now - 10_000, now, 'en')).toBe('just now');
    expect(formatRelativeTime(now - 5 * 60_000, now, 'en')).toBe('5 minutes ago');
    expect(formatRelativeTime(now - 24 * 3_600_000, now, 'en')).toBe('yesterday');
  });

  it('reduces aspect ratios', () => {
    expect(formatAspectRatio(1080, 1920)).toBe('9:16');
    expect(formatAspectRatio(1920, 1080)).toBe('16:9');
    expect(formatAspectRatio(1080, 1080)).toBe('1:1');
  });
});

describe('checkCapabilities', () => {
  const supportedCodecs = (codecs: string[]) => ({
    isConfigSupported: async (config: { codec: string }) => ({ supported: codecs.includes(config.codec) }),
  });

  const fullEnv = (overrides: Partial<CapabilityEnv> = {}): CapabilityEnv => ({
    isSecureContext: true,
    indexedDB: {},
    navigator: { storage: { getDirectory: async () => ({}) } },
    Worker: function Worker() {},
    OffscreenCanvas: function OffscreenCanvas() {},
    OfflineAudioContext: function OfflineAudioContext() {},
    VideoFrame: function VideoFrame() {},
    VideoEncoder: supportedCodecs([CODECS.h264, CODECS.vp9]),
    AudioEncoder: supportedCodecs([CODECS.aac, CODECS.opus]),
    ...overrides,
  });

  it('prefers MP4 when H.264 and AAC are available', async () => {
    const report = await checkCapabilities(fullEnv());
    expect(report.coreOk).toBe(true);
    expect(report.exportOk).toBe(true);
    expect(report.exportTarget?.container).toBe('mp4');
  });

  it('falls back to WebM without AAC', async () => {
    const report = await checkCapabilities(fullEnv({ AudioEncoder: supportedCodecs([CODECS.opus]) }));
    expect(report.exportTarget?.container).toBe('webm');
    expect(report.exportOk).toBe(true);
  });

  it('allows editing but not export without WebCodecs', async () => {
    const report = await checkCapabilities(
      fullEnv({ VideoEncoder: undefined, AudioEncoder: undefined, VideoFrame: undefined }),
    );
    expect(report.coreOk).toBe(true);
    expect(report.exportOk).toBe(false);
    expect(report.exportTarget).toBeNull();
  });

  it('blocks the app without OPFS or a secure context', async () => {
    const noOpfs = await checkCapabilities(
      fullEnv({ navigator: { storage: { getDirectory: async () => Promise.reject(new Error('denied')) } } }),
    );
    expect(noOpfs.coreOk).toBe(false);

    const insecure = await checkCapabilities(fullEnv({ isSecureContext: false }));
    expect(insecure.coreOk).toBe(false);
  });

  it('probes video encoding in both shapes, 1080×1920 and 1920×1080', async () => {
    const probed: string[] = [];
    const VideoEncoder = {
      isConfigSupported: async (config: { codec: string; width: number; height: number }) => {
        probed.push(`${config.codec}@${config.width}x${config.height}`);
        return { supported: true };
      },
    };
    await checkCapabilities(fullEnv({ VideoEncoder }));
    expect(probed).toEqual(expect.arrayContaining([`${CODECS.h264}@1080x1920`, `${CODECS.h264}@1920x1080`]));

    // A codec that only works upright doesn't count: landscape projects couldn't export.
    const portraitOnly = {
      isConfigSupported: async (config: { codec: string; width: number }) => ({ supported: config.width === 1080 }),
    };
    expect((await checkCapabilities(fullEnv({ VideoEncoder: portraitOnly }))).exportOk).toBe(false);
  });

  it('probes 60 fps separately, with a level that allows it, without blocking export', async () => {
    const at60 = ['avc1.64002a', 'vp09.00.41.08'];
    const probed: string[] = [];
    const VideoEncoder = {
      isConfigSupported: async (config: { codec: string; width: number; height: number; framerate?: number; bitrate?: number }) => {
        probed.push(`${config.codec}@${config.width}x${config.height}/${config.framerate}/${config.bitrate}`);
        return { supported: [CODECS.h264, CODECS.vp9, ...at60].includes(config.codec) };
      },
    };
    const report = await checkCapabilities(fullEnv({ VideoEncoder }));
    expect(report.export60fps).toBe(true);
    // Both shapes, at the High preset's 60 fps bitrate (the largest any export uses).
    expect(probed).toEqual(expect.arrayContaining(['avc1.64002a@1080x1920/60/16971000', 'avc1.64002a@1920x1080/60/16971000']));
    expect(report.results.find((r) => r.id === 'export60fps')).toMatchObject({ ok: true, group: 'optional' });

    // A browser that encodes 30 but not 60 fps can still export (at 30).
    const only30 = await checkCapabilities(fullEnv());
    expect(only30.exportOk).toBe(true);
    expect(only30.export60fps).toBe(false);
    expect(only30.results.find((r) => r.id === 'export60fps')?.ok).toBe(false);

    // WebM fallback probes VP9 at 60.
    const webm = await checkCapabilities(
      fullEnv({ VideoEncoder: { isConfigSupported: async (c: { codec: string }) => ({ supported: [CODECS.vp9, 'vp09.00.41.08'].includes(c.codec) }) } }),
    );
    expect(webm.exportTarget?.container).toBe('webm');
    expect(webm.export60fps).toBe(true);

    // No export at all: no 60 fps either.
    const none = await checkCapabilities(fullEnv({ VideoEncoder: undefined }));
    expect(none.export60fps).toBe(false);
  });

  it('treats a throwing encoder probe as unsupported', async () => {
    const throwing = {
      isConfigSupported: async () => {
        throw new TypeError('bad config');
      },
    };
    const report = await checkCapabilities(fullEnv({ VideoEncoder: throwing }));
    expect(report.exportOk).toBe(false);
  });
});
