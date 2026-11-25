import type { Page } from '@playwright/test';

/**
 * Test media generated inside the page (no binary fixtures in the repo): images via
 * OffscreenCanvas, video via MediaRecorder. Returned as Buffers for `setInputFiles`.
 */

export async function makeImage(page: Page, width: number, height: number, type = 'image/png'): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ width, height, type }) => {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#ff3d8b');
      gradient.addColorStop(1, '#3d5bff');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type, quality: 0.9 })).arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    { width, height, type },
  );
  return Buffer.from(base64, 'base64');
}

export async function makeWebm(page: Page, durationMs = 1200): Promise<Buffer> {
  const base64 = await page.evaluate(async (durationMs) => {
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 320;
    const ctx = canvas.getContext('2d')!;
    let hue = 0;
    const draw = () => {
      ctx.fillStyle = `hsl(${(hue += 15) % 360} 80% 55%)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    draw();
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    const timer = setInterval(draw, 33);
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    recorder.stop();
    await stopped;
    clearInterval(timer);
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, durationMs);
  return Buffer.from(base64, 'base64');
}

/** A mono 16-bit PCM WAV with a sine tone, built in Node. */
export function makeWav(durationMs: number, frequency = 440, sampleRate = 22_050): Buffer {
  const samples = Math.round((durationMs / 1000) * sampleRate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.5 * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** An audio-only WebM (Opus) recorded in the page: same container signature as a video WebM. */
export async function makeAudioWebm(page: Page, durationMs = 1500): Promise<Buffer> {
  const base64 = await page.evaluate(async (durationMs) => {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const destination = context.createMediaStreamDestination();
    oscillator.connect(destination);
    oscillator.start();
    const recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    recorder.stop();
    await stopped;
    oscillator.stop();
    await context.close();
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, durationMs);
  return Buffer.from(base64, 'base64');
}
