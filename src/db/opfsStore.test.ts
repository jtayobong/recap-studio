import { describe, expect, it } from 'vitest';
import { createOpfsStore, StorageFullError } from './opfsStore';
import { createMemoryDirectory } from './testing/memoryDirectory';

function setup(options: Parameters<typeof createMemoryDirectory>[0] = {}) {
  const dir = createMemoryDirectory(options);
  return { dir, store: createOpfsStore(async () => dir.handle) };
}

function chunkedStream(chunks: number[], failAfter?: number): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (failAfter !== undefined && index === failAfter) {
        controller.error(new Error('source broke'));
        return;
      }
      const size = chunks[index++];
      if (size === undefined) controller.close();
      else controller.enqueue(new Uint8Array(size).fill(7));
    },
  });
}

describe('opfsStore', () => {
  it('writes a blob and reads it back', async () => {
    const { store, dir } = setup();
    const written = await store.write('assets', 'a', new Blob(['hello']));
    expect(written).toBe(5);
    expect(await (await store.read('assets', 'a'))?.text()).toBe('hello');
    expect(dir.paths()).toEqual(['assets/a']);
  });

  it('streams with progress', async () => {
    const { store } = setup();
    const progress: number[] = [];
    const written = await store.write('assets', 'v', chunkedStream([3, 4, 5]), { onProgress: (n) => progress.push(n) });
    expect(written).toBe(12);
    expect(progress).toEqual([3, 7, 12]);
    expect((await store.read('assets', 'v'))?.size).toBe(12);
  });

  it('returns undefined for missing files and directories', async () => {
    const { store } = setup();
    expect(await store.read('nope', 'a')).toBeUndefined();
    await store.write('assets', 'a', new Blob(['x']));
    expect(await store.read('assets', 'b')).toBeUndefined();
  });

  it('removes files and ignores missing ones', async () => {
    const { store, dir } = setup();
    await store.write('assets', 'a', new Blob(['x']));
    await store.remove('assets', 'a');
    await store.remove('assets', 'a');
    await store.remove('nope', 'a');
    expect(dir.paths()).toEqual([]);
  });

  it('lists files with modification times', async () => {
    const { store } = setup({ now: () => 42 });
    expect(await store.list('assets')).toEqual([]);
    await store.write('assets', 'a', new Blob(['x']));
    await store.write('assets', 'b', new Blob(['y']));
    expect(await store.list('assets')).toEqual([
      { name: 'a', lastModified: 42 },
      { name: 'b', lastModified: 42 },
    ]);
  });

  it('maps quota errors to StorageFullError and leaves no file behind', async () => {
    const { store, dir } = setup({ quotaBytes: 10 });
    await expect(store.write('assets', 'big', chunkedStream([6, 6]))).rejects.toBeInstanceOf(StorageFullError);
    expect(dir.paths()).toEqual([]);
    expect(dir.usedBytes()).toBe(0);
  });

  it('leaves no file behind when the source fails', async () => {
    const { store, dir } = setup();
    await expect(store.write('assets', 'v', chunkedStream([4, 4, 4], 2))).rejects.toThrow('source broke');
    expect(dir.paths()).toEqual([]);
  });

  it('can be aborted', async () => {
    const { store, dir } = setup();
    const controller = new AbortController();
    const write = store.write('assets', 'v', chunkedStream([4, 4, 4, 4]), {
      signal: controller.signal,
      onProgress: (n) => {
        if (n >= 8) controller.abort();
      },
    });
    await expect(write).rejects.toMatchObject({ name: 'AbortError' });
    expect(dir.paths()).toEqual([]);
  });

  it('retries getting the root after a failure', async () => {
    const dir = createMemoryDirectory();
    let calls = 0;
    const store = createOpfsStore(async () => {
      calls += 1;
      if (calls === 1) throw new Error('not yet');
      return dir.handle;
    });
    await expect(store.read('assets', 'a')).rejects.toThrow('not yet');
    expect(await store.read('assets', 'a')).toBeUndefined();
  });
});
