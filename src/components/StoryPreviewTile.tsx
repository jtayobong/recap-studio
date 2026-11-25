import { getPalette } from '../domain/stylePresets';

interface StoryPreviewTileProps {
  name: string;
  paletteId: string;
  width: number;
  height: number;
}

/**
 * A static project thumbnail for the projects list.
 */
export function StoryPreviewTile({ name, paletteId, width, height }: StoryPreviewTileProps) {
  const palette = getPalette(paletteId);
  return (
    <div
      className="story-tile"
      style={{
        aspectRatio: `${width} / ${height}`,
        background: palette.background,
        color: palette.text,
      }}
      aria-hidden="true"
    >
      <span className="story-tile__blob" style={{ background: palette.primary }} />
      <span className="story-tile__bar" style={{ background: palette.accent }} />
      <span className="story-tile__name">{name}</span>
    </div>
  );
}
