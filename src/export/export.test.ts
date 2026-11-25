import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '../domain/asset';
import { createProject, type Project } from '../domain/project';
import { createScene } from '../render/templates/registry';
import { createExportMedia, type DecodedFrame, type ExportAsset } from './exportMedia';
import { gatherExportAssets, mediaAssetIds } from './exportStory';
import { bitrateFor, exportFilename } from './presets';

const A = '0b8f3c5e-6a43-4c0e-9d0b-2f7f7d1f0a11';
const B = '1c9f4d6f-7b54-4d1f-8e1c-3a8a8e2a1b22';
const C = '2da05e70-8c65-4e2a-9f2d-4b9b9f3b2c33';

describe('presets', () => {
  it('uses the reference bitrates at 1080×1920 @ 30', () => {
    const format = { width: 1080, height: 1920, fps: 30 as const };
    expect(bitrateFor('standard', format)).toBe(8_000_000);
    expect(bitrateFor('high', format)).toBe(12_000_000);
    expect(bitrateFor('small', format)).toBe(5_000_000);
  });

  it('scales with pixels and (sub-linearly) with frame rate', () => {
    expect(bitrateFor('standard', { width: 1080, height: 1080, fps: 30 })).toBe(4_500_000);
    expect(bitrateFor('standard', { width: 1080, height: 1920, fps: 60 })).toBe(11_314_000);
  });

  it('makes safe file names', () => {
    expect(exportFilename('My 2026 Recap!', 'mp4')).toBe('my-2026-recap.mp4');
    expect(exportFilename('Café — été ☀️', 'webm')).toBe('cafe-ete.webm');
    expect(exportFilename('../../etc/passwd', 'mp4')).toBe('etc-passwd.mp4');
    expect(exportFilename('   ', 'mp4')).toBe('recap.mp4');
    expect(exportFilename('x'.repeat(200), 'mp4')).toBe(`${'x'.repeat(80)}.mp4`);
  });
});

function projectWith(fieldsPerScene: Record<string, unknown>[], audio?: string): Project {
  const project = createProject({ name: 'Export' }, { now: 1 });
  return {
    ...project,
    scenes: fieldsPerScene.map((fields) => ({ ...createScene(fields.templateId === 'title' ? 'title' : 'photo'), fields })),
    ...(audio ? { audio: { assetId: audio, offsetMs: 0, volume: 1, fadeIn: false, fadeOut: true } } : {}),
  };
}

describe('mediaAssetIds / gatherExportAssets', () => {
  it('collects ids from media fields only (and the audio track)', () => {
    const project = projectWith([{ media: A, caption: B }, { media: '' }, { media: 'not an id!' }, { templateId: 'title', text: C }], C);
    expect(mediaAssetIds(project)).toEqual(new Set([A, C]));
  });

  it("reads only the project's own assets whose files exist", async () => {
    const project = projectWith([{ media: A }, { media: B }, { media: C }]);
    const rows: Record<string, Partial<Asset>> = {
      [A]: { id: A, kind: 'image', projectId: project.id },
      [B]: { id: B, kind: 'video', projectId: 'someone-else' },
      [C]: { id: C, kind: 'image', projectId: project.id },
    };
    const assets = await gatherExportAssets(project, {
      get: async (id) => rows[id] as Asset | undefined,
      readFile: async (id) => (id === C ? undefined : new Blob([id])),
    });
    expect(Object.keys(assets)).toEqual([A]);
    expect(assets[A]?.kind).toBe('image');
  });
});

describe('exportMedia', () => {
  const image = (label: string) => ({ source: { label } as unknown as CanvasImageSource, width: 10, height: 10, close: vi.fn() });

  function setup(assets: Record<string, ExportAsset>) {
    const opened: { file: Blob; timestamps: number[]; reader: { next: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> } }[] = [];
    const decoded: ReturnType<typeof image>[] = [];
    const media = createExportMedia(assets, {
      decodeImage: vi.fn(async (file: Blob) => {
        if ((await file.text()) === 'corrupt') throw new Error('bad image');
        const img = image(await file.text());
        decoded.push(img);
        return img;
      }),
      openVideo: vi.fn(async (file: Blob, timestamps: number[]) => {
        let i = 0;
        const reader = {
          next: vi.fn(async (): Promise<DecodedFrame | null> => {
            const t = timestamps[i++];
            // A 1 s clip: past its end the reader has nothing new.
            return t === undefined || t > 1 ? null : { source: { t } as unknown as CanvasImageSource, width: 4, height: 4 };
          }),
          dispose: vi.fn(),
        };
        opened.push({ file, timestamps, reader });
        return reader;
      }),
    });
    return { media, opened, decoded };
  }

  /** Simulate encodeStory: plan with `requestsPerFrame`, then prepare/resolve/end each frame. */
  async function run(media: ReturnType<typeof setup>['media'], requestsPerFrame: [string, number][][]) {
    requestsPerFrame.forEach((requests, frame) => {
      media.planFrame(frame);
      for (const [id, ms] of requests) media.recorder.frame(id, ms);
    });
    media.finishPlanning();
    const answers: (string | number | undefined)[][] = [];
    const open: { images: number; readers: number }[] = [];
    for (let frame = 0; frame < requestsPerFrame.length; frame += 1) {
      await media.prepare(frame);
      answers.push(
        requestsPerFrame[frame]!.map(([id, ms]) => {
          const f = media.resolver.frame(id, ms);
          const source = f?.source as unknown as { label?: string; t?: number } | undefined;
          return source?.label ?? source?.t;
        }),
      );
      media.endFrame(frame);
      open.push(media.openCounts());
    }
    return { answers, open };
  }

  it('the recorder answers nothing; the resolver answers what was prepared', async () => {
    const { media } = setup({ [A]: { kind: 'image', file: new Blob(['photo-a']) } });
    media.planFrame(0);
    expect(media.recorder.frame(A, 0)).toBeUndefined();
    media.finishPlanning();
    await media.prepare(0);
    expect(media.resolver.frame(A, 0)).toMatchObject({ width: 10, kind: 'image' });
  });

  it('decodes each image once, and frees it after its last frame', async () => {
    const { media, decoded } = setup({ [A]: { kind: 'image', file: new Blob(['photo-a']) } });
    const { answers, open } = await run(media, [[[A, 0]], [[A, 33]], [[A, 66]], []]);
    expect(answers).toEqual([['photo-a'], ['photo-a'], ['photo-a'], []]);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]?.close).toHaveBeenCalledOnce();
    expect(open.map((o) => o.images)).toEqual([1, 1, 0, 0]);
  });

  it('gives each video reader its full timestamp list up front and holds the last frame past the end', async () => {
    const { media, opened } = setup({ [B]: { kind: 'video', file: new Blob(['clip']) } });
    const { answers, open } = await run(media, [[[B, 0]], [[B, 500]], [[B, 1000]], [[B, 1500]], []]);
    expect(opened).toHaveLength(1);
    expect(opened[0]?.timestamps).toEqual([0, 0.5, 1, 1.5]);
    expect(answers).toEqual([[0], [0.5], [1], [1], []]); // 1.5 s is past the clip: frame at 1 s holds
    expect(opened[0]?.reader.dispose).toHaveBeenCalledOnce();
    expect(open.map((o) => o.readers)).toEqual([1, 1, 1, 0, 0]);
  });

  it('two uses of one clip in a frame (a transition) get separate monotonic streams', async () => {
    const { media, opened } = setup({ [B]: { kind: 'video', file: new Blob(['clip']) } });
    // Frame 1: the outgoing scene holds the clip at 1 s while the incoming scene starts it at 0.
    const { answers } = await run(media, [[[B, 900]], [[B, 1000], [B, 0]], [[B, 33]]]);
    expect(opened.map((o) => o.timestamps)).toEqual([[0.9, 1, 0.033], [0]]);
    expect(answers).toEqual([[0.9], [1, 0], [0.033]]);
  });

  it('reports missing and undecodable assets once, and draws placeholders for them', async () => {
    const { media } = setup({ [C]: { kind: 'image', file: new Blob(['corrupt']) } });
    const { answers } = await run(media, [[[A, 0], [C, 0]], [[A, 33], [C, 33]]]);
    expect(answers).toEqual([
      [undefined, undefined],
      [undefined, undefined],
    ]);
    expect(media.failures()).toEqual(
      new Map([
        [A, 'missing from the library'],
        [C, 'bad image'],
      ]),
    );
  });

  it('refuses to prepare before planning is finished', async () => {
    const { media } = setup({});
    await expect(media.prepare(0)).rejects.toThrow(/finishPlanning/);
  });
});
