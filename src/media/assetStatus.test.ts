import { describe, expect, it, vi } from 'vitest';
import { createAssetStatusStore } from './assetStatus';

function setup(files: Record<string, { file?: boolean; thumb?: boolean }>) {
  const readFile = vi.fn(async (id: string) => (files[id]?.file ? new File(['x'], id) : undefined));
  const readThumbnail = vi.fn(async (id: string) => (files[id]?.thumb ? new Blob(['t'], { type: 'image/webp' }) : undefined));
  return { store: createAssetStatusStore({ readFile, readThumbnail }), readFile };
}

describe('assetStatus store', () => {
  it('starts as loading, then reports ready with a thumbnail URL', async () => {
    const { store } = setup({ a: { file: true, thumb: true } });
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.get('a')).toEqual({ state: 'loading' });
    await store.ensure('a');
    const status = store.get('a');
    expect(status.state).toBe('ready');
    expect(status.state !== 'loading' && status.thumbnailUrl).toMatch(/^blob:/);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('reports missing files, and read errors as missing', async () => {
    const { store, readFile } = setup({ a: { thumb: true } });
    await store.ensure('a');
    expect(store.get('a').state).toBe('missing');
    readFile.mockRejectedValueOnce(new Error('boom'));
    await store.ensure('b');
    expect(store.get('b')).toEqual({ state: 'missing' });
  });

  it('loads each asset once', async () => {
    const { store, readFile } = setup({ a: { file: true } });
    await Promise.all([store.ensure('a'), store.ensure('a')]);
    await store.ensure('a');
    expect(readFile).toHaveBeenCalledOnce();
  });

  it('release revokes the URL and allows a reload', async () => {
    const { store, readFile } = setup({ a: { file: true, thumb: true } });
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    await store.ensure('a');
    const status = store.get('a');
    store.release('a');
    expect(revoke).toHaveBeenCalledWith(status.state !== 'loading' ? status.thumbnailUrl : '');
    expect(store.get('a').state).toBe('loading');
    await store.ensure('a');
    expect(readFile).toHaveBeenCalledTimes(2);
    revoke.mockRestore();
  });

  it('does not resurrect an asset released while loading', async () => {
    const { store } = setup({ a: { file: true, thumb: true } });
    const loading = store.ensure('a');
    store.release('a');
    await loading;
    expect(store.get('a').state).toBe('loading');
  });
});
