import { expect, test, type Page } from '@playwright/test';
import { makeWav } from './helpers/media';
import type * as DbExports from '../src/db/index';
import type * as ExportExports from '../src/export/exportStory';
import type * as InspectExports from '../src/export/testing/inspectExport';
import type * as MediaExports from '../src/media/index';
import type * as RegistryExports from '../src/render/templates/registry';

/**
 * "Keep clip sound": a clip's own audio plays (and the music ducks under it) in the export and the
 * preview. The clip's sound is an 880 Hz tone and the music a 330 Hz tone, so each can be measured
 * separately in the decoded export.
 */

test.setTimeout(120_000);

type Modules = {
  db: typeof DbExports;
  exporter: typeof ExportExports;
  inspect: typeof InspectExports;
  media: typeof MediaExports;
  registry: typeof RegistryExports;
};

const MUSIC_HZ = 330;
const CLIP_HZ = 880;

/** Project: title (0–2 s), clip with sound (2–5 s), title (5–8 s); music throughout. */
async function storyWithClipSound(page: Page, clipSound: boolean): Promise<string> {
  await page.goto('/system');
  const song = makeWav(10_000, MUSIC_HZ, 22_050).toString('base64');
  return page.evaluate(
    async ({ song, clipSound, clipHz }) => {
      const load = (path: string) => import(path);
      const m = {
        db: await load('/src/db/index.ts'),
        media: await load('/src/media/index.ts'),
        registry: await load('/src/render/templates/registry.ts'),
      } as Pick<Modules, 'db' | 'media' | 'registry'>;

      // A 3 s clip: moving picture plus an 880 Hz tone as its own sound.
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 568;
      const ctx = canvas.getContext('2d')!;
      let frame = 0;
      const draw = () => {
        ctx.fillStyle = `hsl(${(frame += 9) % 360} 70% 50%)`;
        ctx.fillRect(0, 0, 320, 568);
      };
      draw();
      const audio = new AudioContext();
      const tone = audio.createOscillator();
      tone.frequency.value = clipHz;
      const level = audio.createGain();
      level.gain.value = 0.5;
      const destination = audio.createMediaStreamDestination();
      tone.connect(level).connect(destination);
      tone.start();
      const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...destination.stream.getAudioTracks()]);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      const stopped = new Promise((resolve) => (recorder.onstop = resolve));
      const timer = setInterval(draw, 33);
      recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 3200));
      recorder.stop();
      await stopped;
      clearInterval(timer);
      tone.stop();
      await audio.close();

      const project = await m.db.projectRepository.create({ name: 'Clip sound' });
      const bytes = Uint8Array.from(atob(song), (c) => c.charCodeAt(0));
      const { imported, failed } = await m.media.importer.importFiles(
        [new File(chunks, 'talking.webm', { type: 'video/webm' }), new File([bytes], 'song.wav')],
        project.id,
      );
      if (failed.length > 0) throw new Error(failed.map((f) => f.error.message).join('; '));
      const clip = imported.find((a) => a.kind === 'video')!;
      const music = imported.find((a) => a.kind === 'audio')!;
      const title = (ms: number) => ({ ...m.registry.createScene('title'), durationMs: ms, transitionIn: 'cut' as const });
      const clipScene = { ...m.registry.createScene('photo'), durationMs: 3000, transitionIn: 'cut' as const };
      clipScene.fields = { ...clipScene.fields, media: clip.id, caption: '', motion: 'none', clipSound };
      await m.db.projectRepository.save({
        ...project,
        scenes: [title(2000), clipScene, title(3000)],
        audio: { assetId: music.id, offsetMs: 0, volume: 1, fadeIn: false, fadeOut: false },
      });
      return project.id;
    },
    { song, clipSound, clipHz: CLIP_HZ },
  );
}

async function exportTones(page: Page, projectId: string) {
  return page.evaluate(
    async ({ projectId, freqs }) => {
      const db = (await import('/src/db/index.ts' as string)) as typeof DbExports;
      const exporter = (await import('/src/export/exportStory.ts' as string)) as typeof ExportExports;
      const inspect = (await import('/src/export/testing/inspectExport.ts' as string)) as typeof InspectExports;
      const project = (await db.projectRepository.get(projectId))!;
      const file = await exporter.exportStory(project, db.assetRepository);
      // Before the clip (music only), during it, and after the duck has ramped back up.
      const audio = await inspect.inspectAudio(file.blob, [[0.4, 1.4], [2.6, 4.4], [5.6, 7.6]], freqs);
      return { tones: audio!.tones, music: file.music };
    },
    { projectId, freqs: [MUSIC_HZ, CLIP_HZ] },
  );
}

test('export: the clip is heard and the music ducks under it, only while that scene plays', async ({ page }, testInfo) => {
  const projectId = await storyWithClipSound(page, true);
  const { tones, music } = await exportTones(page, projectId);
  testInfo.annotations.push({ type: 'tones [330 Hz, 880 Hz] per window', description: JSON.stringify(tones) });
  const [before, during, after] = tones as [number[], number[], number[]];

  expect(music).toEqual({ included: true });
  // Music at full level outside the clip scene, no clip tone there.
  expect(before[0]).toBeGreaterThan(0.35);
  expect(after[0]).toBeGreaterThan(0.35);
  expect(before[1]).toBeLessThan(0.02);
  expect(after[1]).toBeLessThan(0.02);
  // During the clip scene: its own tone is there, the music is ducked to ~30 %.
  expect(during[1]).toBeGreaterThan(0.2);
  expect(during[0]! / before[0]!).toBeGreaterThan(0.2);
  expect(during[0]! / before[0]!).toBeLessThan(0.4);
});

test('export: without "Keep clip sound" the clip stays silent and the music isn’t ducked', async ({ page }) => {
  const projectId = await storyWithClipSound(page, false);
  const { tones } = await exportTones(page, projectId);
  const [before, during] = tones as [number[], number[]];
  expect(during[1]).toBeLessThan(0.02);
  expect(during[0]! / before[0]!).toBeGreaterThan(0.9);
});

test('preview: the clip plays with sound and the music ducks while that scene plays; mute silences both', async ({ page }) => {
  const projectId = await storyWithClipSound(page, true);
  await page.goto(`/project/${projectId}`);
  await expect(page.getByRole('button', { name: 'Mute sound' })).toBeVisible();
  const musicVolume = () => page.getByTestId('preview-music').evaluate((el) => (el as HTMLAudioElement).volume);
  const audibleClips = () =>
    page.evaluate(async () => {
      const { mediaCache } = (await import('/src/media/index.ts' as string)) as typeof MediaExports;
      return mediaCache.stats().audibleVideos;
    });

  // Start inside the clip scene.
  await page.getByLabel('Playhead').fill('2500');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect.poll(audibleClips, { timeout: 10_000 }).toBe(1);
  await expect.poll(musicVolume).toBeLessThan(0.35);

  await page.keyboard.press('m');
  await expect.poll(audibleClips).toBe(0);
  await page.keyboard.press('m');
  await expect.poll(audibleClips).toBe(1);

  // After the clip scene ends (5 s), the clip is silent and the music is back up.
  await expect.poll(audibleClips, { timeout: 8000 }).toBe(0);
  await expect.poll(musicVolume, { timeout: 8000 }).toBeGreaterThan(0.95);
});
