/**
 * Shape helpers for templates that lay out differently in a tall (9:16) and a wide (16:9) frame.
 *
 * Sizes (text, strokes, radii) use `unit`, the frame's shorter side: 1080 px in both 1080×1920 and
 * 1920×1080, and exactly the width in portrait, so portrait layouts computed from `unit` are
 * identical to the original width-based ones. Positions differ per shape: a template picks a
 * portrait or landscape geometry with `isLandscape`.
 */

export interface FrameSize {
  width: number;
  height: number;
}

export function isLandscape(frame: FrameSize): boolean {
  return frame.width > frame.height;
}

/** The frame's shorter side: the base for sizes that should look the same in both shapes. */
export function unitOf(frame: FrameSize): number {
  return Math.min(frame.width, frame.height);
}
