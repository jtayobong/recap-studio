import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkCapabilities, CODECS, type CapabilityEnv } from './capabilities';
import { debounce } from './debounce';
import { formatAspectRatio, formatBytes, formatRelativeTime } from './format';

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
