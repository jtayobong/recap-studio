import type { BackgroundMotion } from '../domain/project';
import { isolated, withAlpha, type Ctx2D, type FrameInfo, type Theme } from './context';
import { seededRandom } from './easing';

/**
 * Background motion (M11): a layer of slowly drifting shapes behind every scene, set once for the
 * story (`project.style.backgroundMotion`). Templates call `fillBackground` instead of filling the
 * background themselves; with motion off it is exactly the old plain fill.
 *
 * The layer follows story time (`frame.storyMs`), not scene time, so the shapes keep drifting
 * across scene changes instead of jumping back at every cut. Pure and deterministic: positions come
 * from `seededRandom` and the time only.
 */

interface MotionLevel {
  count: number;
  /** Opacity of each shape. */
  alpha: number;
  /** Speed multiplier. */
  speed: number;
  /** Single small dots drawn as well (M12, Subtle only), so the layer has some fine detail. */
  singles: number;
}

const LEVELS: Record<Exclude<BackgroundMotion, 'off'>, MotionLevel> = {
  subtle: { count: 8, alpha: 0.16, speed: 1, singles: 6 },
  lively: { count: 14, alpha: 0.26, speed: 1.9, singles: 0 },
};

/** How much a template's own shapes should move: 0 (off), 1 (subtle), 2 (lively). */
export function motionAmount(theme: Theme): number {
  switch (theme.motion) {
    case 'subtle':
      return 1;
    case 'lively':
      return 2;
    default:
      return 0;
  }
}

type ShapeKind = 'disc' | 'ring' | 'square' | 'dots' | 'dot';
const KINDS: readonly ShapeKind[] = ['disc', 'ring', 'square', 'dots'];

export interface BackdropShape {
  kind: ShapeKind;
  x: number;
  y: number;
  /** Size in pixels (radius for round shapes, half side for squares). */
  size: number;
  rotation: number;
  color: string;
}

const rand = (index: number, salt: number) => seededRandom(index * 7919 + salt * 104729 + 17);

/** Wrap `value` into [min, min + span). */
const wrap = (value: number, min: number, span: number) => min + ((((value - min) % span) + span) % span);

/** Seed offset for the single dots, so adding them leaves the other shapes where they were. */
const SINGLES_SEED = 1000;

/**
 * Where shape `seed` is at `seconds`: it drifts in a fixed direction, a few percent of the frame per
 * second, and wraps round the edges (with a margin so it leaves the frame before it reappears on the
 * other side).
 */
function drift(seed: number, size: number, speedScale: number, width: number, height: number, seconds: number, level: MotionLevel) {
  const u = Math.min(width, height);
  const angle = rand(seed, 2) * Math.PI * 2;
  const speed = u * (0.018 + rand(seed, 3) * 0.03) * level.speed * speedScale;
  const margin = size * 2;
  const x = wrap(rand(seed, 4) * width + Math.cos(angle) * speed * seconds, -margin, width + margin * 2);
  const bob = Math.sin(seconds * (0.6 + rand(seed, 5)) * level.speed + rand(seed, 6) * 6.28) * u * 0.012;
  const y = wrap(rand(seed, 7) * height + Math.sin(angle) * speed * seconds + bob, -margin, height + margin * 2);
  return { x, y };
}

/** The shapes at story time `storyMs` (exported for tests). Empty when motion is off. */
export function backdropShapes(width: number, height: number, storyMs: number, theme: Theme): BackdropShape[] {
  if (!theme.motion || theme.motion === 'off') return [];
  const level = LEVELS[theme.motion];
  const u = Math.min(width, height);
  const seconds = storyMs / 1000;
  const colors = [theme.palette.primary, theme.palette.accent, theme.palette.text, theme.palette.primary];
  const shapes = Array.from({ length: level.count }, (_, i): BackdropShape => {
    const kind = KINDS[i % KINDS.length] as ShapeKind;
    const size = u * (0.035 + rand(i, 1) * (kind === 'dots' ? 0.03 : 0.09));
    const { x, y } = drift(i, size, 1, width, height, seconds, level);
    const spin = (rand(i, 8) - 0.5) * 0.6 * level.speed;
    return { kind, x, y, size, rotation: rand(i, 9) * Math.PI + spin * seconds, color: colors[i % colors.length] as string };
  });
  // Single dots: small, a little slower than the shapes, in the accent and text colours.
  const singles = Array.from({ length: level.singles }, (_, i): BackdropShape => {
    const seed = SINGLES_SEED + i;
    const size = u * (0.006 + rand(seed, 1) * 0.005);
    const { x, y } = drift(seed, size, 0.7, width, height, seconds, level);
    return { kind: 'dot', x, y, size, rotation: 0, color: (i % 2 === 0 ? theme.palette.accent : theme.palette.text) };
  });
  return [...shapes, ...singles];
}

function drawShape(ctx: Ctx2D, shape: BackdropShape, u: number): void {
  isolated(ctx, () => {
    ctx.translate(shape.x, shape.y);
    ctx.rotate(shape.rotation);
    ctx.fillStyle = shape.color;
    ctx.strokeStyle = shape.color;
    switch (shape.kind) {
      case 'disc':
      case 'dot':
        ctx.beginPath();
        ctx.arc(0, 0, shape.size, 0, Math.PI * 2);
        ctx.fill();
        return;
      case 'ring':
        ctx.lineWidth = u * 0.012;
        ctx.beginPath();
        ctx.arc(0, 0, shape.size, 0, Math.PI * 2);
        ctx.stroke();
        return;
      case 'square':
        ctx.lineWidth = u * 0.012;
        ctx.strokeRect(-shape.size, -shape.size, shape.size * 2, shape.size * 2);
        return;
      case 'dots':
        for (let d = 0; d < 3; d += 1) {
          ctx.beginPath();
          ctx.arc((d - 1) * shape.size * 0.9, 0, shape.size * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
    }
  });
}

/** Draw only the moving shapes (no fill). */
export function drawBackdrop(ctx: Ctx2D, width: number, height: number, storyMs: number, theme: Theme): void {
  const shapes = backdropShapes(width, height, storyMs, theme);
  if (shapes.length === 0) return;
  const level = LEVELS[theme.motion as Exclude<BackgroundMotion, 'off'>];
  const u = Math.min(width, height);
  withAlpha(ctx, level.alpha, () => shapes.forEach((shape) => drawShape(ctx, shape, u)));
}

/**
 * Fill the scene background (or only `rect` of it) and draw the background motion on top. Templates
 * call this first, so their own shapes and text sit above the moving layer.
 */
export function fillBackground(
  ctx: Ctx2D,
  frame: Pick<FrameInfo, 'width' | 'height' | 'localMs' | 'storyMs'>,
  theme: Theme,
  rect: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: frame.width, height: frame.height },
): void {
  ctx.fillStyle = theme.palette.background;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  if (!theme.motion || theme.motion === 'off') return;
  isolated(ctx, () => {
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    drawBackdrop(ctx, frame.width, frame.height, frame.storyMs ?? frame.localMs, theme);
  });
}
