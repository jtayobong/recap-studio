import type { Asset } from '../domain/asset';
import { formatBytes, formatDuration } from '../lib/format';
import { useAssetStatus } from '../media';
import { setAssetDragData } from '../media/dragData';

interface AssetTileProps {
  asset: Asset;
  /** Number of scenes using this asset. */
  usage: number;
  onDelete: () => void;
}

const KIND_LABEL: Record<Asset['kind'], string> = { image: 'Photo', video: 'Video', audio: 'Music' };

/** Where an asset is used. Audio is only ever the story's music (one track per story). */
export function usageLabel(asset: Asset, usage: number): string {
  if (usage === 0) return 'Not used';
  if (asset.kind === 'audio') return 'Story music';
  return `In ${usage} ${usage === 1 ? 'scene' : 'scenes'}`;
}

export function describeAsset(asset: Asset): string {
  const parts = [KIND_LABEL[asset.kind]];
  if (asset.width && asset.height) parts.push(`${asset.width}×${asset.height}`);
  if (asset.durationMs !== undefined) parts.push(formatDuration(asset.durationMs));
  parts.push(formatBytes(asset.bytes));
  return parts.join(' · ');
}

/** Square thumbnail (or a kind label while there is none). Decorative: callers name the asset. */
export function AssetThumbnail({ asset }: { asset: Asset }) {
  const status = useAssetStatus(asset.id);
  const thumbnailUrl = status.state === 'loading' ? undefined : status.thumbnailUrl;
  return thumbnailUrl ? (
    <img src={thumbnailUrl} alt="" draggable={false} />
  ) : (
    <span className={`asset-tile__placeholder asset-tile__placeholder--${asset.kind}`} aria-hidden="true">
      {asset.kind === 'audio' ? '♪' : KIND_LABEL[asset.kind]}
    </span>
  );
}

/**
 * One item in the media library: thumbnail, name, badges and a delete button.
 * Draggable onto a scene's media slot (the keyboard path is the slot's "Choose…" button).
 */
export function AssetTile({ asset, usage, onDelete }: AssetTileProps) {
  const missing = useAssetStatus(asset.id).state === 'missing';
  const details = describeAsset(asset);

  return (
    <li
      className={`asset-tile${missing ? ' asset-tile--missing' : ''}`}
      aria-label={asset.filename}
      draggable
      onDragStart={(event) => setAssetDragData(event.dataTransfer, asset)}
    >
      <div className="asset-tile__thumb">
        <AssetThumbnail asset={asset} />
        {asset.durationMs !== undefined && (
          <span className="asset-tile__badge">
            <span className="visually-hidden">Duration </span>
            {formatDuration(asset.durationMs)}
          </span>
        )}
        {missing && <span className="asset-tile__badge asset-tile__badge--warning">Missing file</span>}
      </div>
      <div className="asset-tile__body">
        <span className="asset-tile__name" title={`${asset.filename}\n${details}`}>
          {asset.filename}
        </span>
        <span className="asset-tile__meta">
          {usageLabel(asset, usage)}
          <span className="visually-hidden">. {details}</span>
        </span>
      </div>
      <button
        type="button"
        className="asset-tile__delete button button--ghost button--small"
        onClick={onDelete}
        aria-label={`Delete ${asset.filename}`}
        title="Delete"
      >
        ×
      </button>
    </li>
  );
}
