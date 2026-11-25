import { AssetIdSchema, AssetKindSchema, type Asset, type AssetKind } from '../domain/asset';

/**
 * Drag-and-drop payload for library tiles. The kind is also encoded as its own type, because
 * during dragover a page can see the types but not the data; that lets a slot reject a video
 * before it is dropped onto a photo-only slot.
 */
export const ASSET_DRAG_TYPE = 'application/x-recap-asset';
const KIND_PREFIX = 'application/x-recap-asset-kind-';

export function setAssetDragData(transfer: DataTransfer, asset: Pick<Asset, 'id' | 'kind'>): void {
  transfer.setData(ASSET_DRAG_TYPE, asset.id);
  transfer.setData(`${KIND_PREFIX}${asset.kind}`, '1');
  transfer.effectAllowed = 'copy';
}

export function isAssetDrag(transfer: DataTransfer | null): boolean {
  return transfer?.types.includes(ASSET_DRAG_TYPE) ?? false;
}

/** The dragged asset's kind; readable during dragover. */
export function draggedAssetKind(transfer: DataTransfer | null): AssetKind | undefined {
  const type = transfer?.types.find((t) => t.startsWith(KIND_PREFIX));
  const parsed = AssetKindSchema.safeParse(type?.slice(KIND_PREFIX.length));
  return parsed.success ? parsed.data : undefined;
}

/** The dropped asset id (only readable on drop), validated because drag data is untrusted. */
export function droppedAssetId(transfer: DataTransfer | null): string | undefined {
  const parsed = AssetIdSchema.safeParse(transfer?.getData(ASSET_DRAG_TYPE));
  return parsed.success ? parsed.data : undefined;
}

export function hasFiles(transfer: DataTransfer | null): boolean {
  return transfer?.types.includes('Files') ?? false;
}
