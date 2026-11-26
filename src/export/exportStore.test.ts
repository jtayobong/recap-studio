import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../domain/project';
import type { ExportedFile, ExportStoryOptions } from './exportStory';
import { createExportStore, exportWouldBeLost } from './exportStore';

const project = createProject({ name: 'Store' }, { now: 1 });
const source = { get: async () => undefined, readFile: async () => undefined };

const file = (): ExportedFile => ({
  blob: new Blob(['video']),
  filename: 'store.mp4',
  target: { container: 'mp4', codec: 'avc', mimeType: 'video/mp4', extension: 'mp4' },
  bitrate: 8_000_000,
  fps: 30,
  totalFrames: 30,
  elapsedMs: 100,
  timings: { draw: 0, prepare: 0, encode: 0, audio: 0 },
  mediaFailures: {},
  music: { included: false },
});

/** A fake exporter the test drives by hand: report progress, then finish or fail. */
function controllableRun() {
  let options: ExportStoryOptions = {};
  let finish!: (value: ExportedFile) => void;
  let fail!: (error: unknown) => void;
  const run = vi.fn(
    (_project: unknown, _source: unknown, opts: ExportStoryOptions = {}) =>
      new Promise<ExportedFile>((resolve, reject) => {
        options = opts;
        finish = resolve;
        fail = reject;
        opts.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
      }),
  );
  return { run, progress: (f: number) => options.onProgress?.(f), finish: (v = file()) => finish(v), fail: (e: unknown) => fail(e), options: () => options };
}

function setup() {
  const fake = controllableRun();
  const revoke = vi.fn();
  const store = createExportStore(source, {
    run: fake.run as never,
    now: () => 1000,
    createObjectURL: () => 'blob:fake',
    revokeObjectURL: revoke,
  });
  return { store, fake, revoke, state: () => store.getState().state };
}

describe('export store', () => {
  it('goes idle → exporting (with progress) → done, passing the chosen preset', async () => {
    const { store, fake, state } = setup();
    const running = store.getState().start(project, 'high');
    expect(state()).toMatchObject({ status: 'exporting', projectId: project.id, fraction: 0 });
    expect(fake.options().preset).toBe('high');
    expect(fake.options().fps).toBe(30); // the default frame rate

    fake.progress(0.255);
    fake.progress(0.259); // same whole percent: no extra update
    expect(state()).toMatchObject({ fraction: 0.255 });

    fake.finish();
    await running;
    expect(state()).toMatchObject({ status: 'done', url: 'blob:fake', file: { filename: 'store.mp4' } });
  });

  it('ignores a second start while exporting', async () => {
    const { store, fake } = setup();
    void store.getState().start(project, 'standard');
    void store.getState().start(project, 'standard');
    expect(fake.run).toHaveBeenCalledOnce();
  });

  it('cancel aborts the export and returns to idle with a notice', async () => {
    const { store, fake, state } = setup();
    const running = store.getState().start(project, 'standard');
    store.getState().cancel();
    expect(fake.options().signal?.aborted).toBe(true);
    expect(state()).toEqual({ status: 'idle', notice: 'Export cancelled.' });
    await running;
    expect(state()).toEqual({ status: 'idle', notice: 'Export cancelled.' }); // the late rejection changes nothing
  });

  it('passes the chosen frame rate to the exporter', async () => {
    const { store, fake } = setup();
    void store.getState().start(project, 'standard', 60);
    expect(fake.options()).toMatchObject({ preset: 'standard', fps: 60 });
  });

  it('errors keep the preset and frame rate for "Try again"', async () => {
    const { store, fake, state } = setup();
    const running = store.getState().start(project, 'small', 60);
    fake.fail(new Error('Encoder exploded'));
    await running;
    expect(state()).toEqual({ status: 'error', projectId: project.id, message: 'Encoder exploded', preset: 'small', fps: 60 });
  });

  it('dismiss and a new export free the previous file', async () => {
    const { store, fake, revoke, state } = setup();
    let running = store.getState().start(project, 'standard');
    fake.finish();
    await running;
    running = store.getState().start(project, 'standard');
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    fake.finish();
    await running;
    store.getState().dismiss();
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(state()).toEqual({ status: 'idle' });
  });

  it('dismiss does nothing while exporting', () => {
    const { store, state } = setup();
    void store.getState().start(project, 'standard');
    store.getState().dismiss();
    expect(state().status).toBe('exporting');
  });
});

describe('leaving the editor', () => {
  it('would lose work while exporting, and until the file is downloaded', async () => {
    const { store, fake, state } = setup();
    expect(exportWouldBeLost(state())).toBe(false);
    const running = store.getState().start(project, 'standard');
    expect(exportWouldBeLost(state())).toBe(true);
    fake.finish();
    await running;
    expect(exportWouldBeLost(state())).toBe(true);
    store.getState().markDownloaded();
    expect(state()).toMatchObject({ status: 'done', downloaded: true });
    expect(exportWouldBeLost(state())).toBe(false);
  });
});

