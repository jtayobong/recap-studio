import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { Asset } from '../domain/asset';
import { useAssetStatus } from '../media';
import { coverRect } from '../render/media';

export interface FocusBinding {
  x: number;
  y: number;
  /** Output width ÷ height when the media is cropped (cover); undefined when it isn't. */
  cropAspect?: number;
  /**
   * `gesture` identifies one continuous interaction (a drag, a run of key presses, a re-center).
   * Updates with the same gesture form one undo step; a new gesture starts a new step.
   */
  onChange: (x: number, y: number, gesture: string) => void;
}

const STEP = 0.02;
const BIG_STEP = 0.1;
const MAX_HEIGHT_PX = 220;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(clamp01(value) * 100) / 100;
const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * Pick the crop focus point by clicking or dragging on the media, or with the arrow keys
 * (Shift for bigger steps, Home to re-center). When the media is cropped, the part that stays
 * visible in the story frame is outlined.
 */
export function FocusPicker({ asset, focus }: { asset: Asset; focus: FocusBinding }) {
  const status = useAssetStatus(asset.id);
  const thumbnailUrl = status.state === 'loading' ? undefined : status.thumbnailUrl;
  const padRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const gesture = useRef({ id: 0, kind: '' });

  /** Start a new undo step unless this continues the same kind of interaction. */
  const nextGesture = (kind: 'drag' | 'keys' | 'center', continuing = false): string => {
    if (!continuing || gesture.current.kind !== kind) gesture.current = { id: gesture.current.id + 1, kind };
    return `${kind}-${gesture.current.id}`;
  };
  const center = () => focus.onChange(0.5, 0.5, nextGesture('center'));
  const width = asset.width ?? 1;
  const height = asset.height ?? 1;
  const aspect = width / height;

  const crop = focus.cropAspect
    ? coverRect(width, height, { width: focus.cropAspect, height: 1 }, focus.x, focus.y)
    : undefined;

  const setFromPointer = (event: PointerEvent<HTMLDivElement>, gestureId: string) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    focus.onChange(round((event.clientX - rect.left) / rect.width), round((event.clientY - rect.top) / rect.height), gestureId);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (event.key === 'Home') {
      event.preventDefault();
      center();
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    event.stopPropagation(); // don't step the playhead
    focus.onChange(round(focus.x + move[0]), round(focus.y + move[1]), nextGesture('keys', true));
  };

  return (
    <div className="focus-picker">
      <div className="focus-picker__row">
        <span className="field__label">Focus point</span>
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={center}
          disabled={focus.x === 0.5 && focus.y === 0.5}
        >
          Center
        </button>
      </div>
      <div
        ref={padRef}
        className="focus-picker__pad"
        style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, ${Math.round(MAX_HEIGHT_PX * aspect)}px)` }}
        tabIndex={0}
        role="group"
        aria-label={`Focus point: ${percent(focus.x)} across, ${percent(focus.y)} down`}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus();
          setFromPointer(event, nextGesture('drag'));
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) setFromPointer(event, nextGesture('drag', true));
        }}
        data-testid="focus-pad"
      >
        {thumbnailUrl && <img src={thumbnailUrl} alt="" draggable={false} />}
        {crop && (
          <div
            className="focus-picker__crop"
            aria-hidden="true"
            style={{
              left: `${(crop.x / width) * 100}%`,
              top: `${(crop.y / height) * 100}%`,
              width: `${(crop.width / width) * 100}%`,
              height: `${(crop.height / height) * 100}%`,
            }}
          />
        )}
        <div
          className="focus-picker__marker"
          aria-hidden="true"
          style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }}
        />
      </div>
      <p id={hintId} className="field__hint">
        {crop
          ? 'Click or drag to choose what stays in frame. Arrow keys nudge, Home re-centers.'
          : 'The focus point applies when Fit is “Fill the screen”.'}
      </p>
    </div>
  );
}
