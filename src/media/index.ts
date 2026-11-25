import { assetRepository } from '../db';
import { requestPersistentStorage } from '../lib/storage';
import { useAssetStatusFrom, createAssetStatusStore, type AssetStatus } from './assetStatus';
import { createBrowserProbe } from './browserProbe';
import { createImporter } from './importAsset';
import { createMediaCache } from './mediaCache';

/** App-wide importer. Tests build their own with `createImporter` and fakes. */
export const importer = createImporter({
  assets: assetRepository,
  probe: createBrowserProbe(),
  estimateStorage: async () => navigator.storage?.estimate?.(),
  requestPersistence: requestPersistentStorage,
});

/** Thumbnail URLs and missing-file state for library tiles. */
export const assetStatus = createAssetStatusStore(assetRepository);

export function useAssetStatus(assetId: string): AssetStatus {
  return useAssetStatusFrom(assetStatus, assetId);
}

/** Decoded images and video elements for the preview and scene thumbnails. */
export const mediaCache = createMediaCache({
  getAsset: (id) => assetRepository.get(id),
  readFile: (id) => assetRepository.readFile(id),
  readThumbnail: (id) => assetRepository.readThumbnail(id),
  decodeImage: (blob) => createImageBitmap(blob),
  createVideo: () => document.createElement('video'),
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
});
