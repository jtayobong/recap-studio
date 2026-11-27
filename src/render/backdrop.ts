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
  /** Strings of banderitas along the top edge (Fiesta shapes only, M12.7). */
  garlands: number;
  /** Opacity of the banderitas strings: a bit clearer than the drifting shapes, still soft. */
  garlandAlpha: number;
}

const LEVELS: Record<Exclude<BackgroundMotion, 'off'>, MotionLevel> = {
  subtle: { count: 8, alpha: 0.16, speed: 1, singles: 6, garlands: 1, garlandAlpha: 0.4 },
  lively: { count: 14, alpha: 0.26, speed: 1.9, singles: 0, garlands: 2, garlandAlpha: 0.5 },
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

type GeometricKind = 'disc' | 'ring' | 'square' | 'dots';
/**
 * Fiesta shapes that drift (M12.3): a parol star lantern, an eight-ray sun, a star. The banderitas
 * are strings across the top instead (`garlandStrings`, M12.7).
 */
type FiestaKind = 'parol' | 'sun' | 'star';
type ShapeKind = GeometricKind | FiestaKind | 'dot';
const KINDS: readonly GeometricKind[] = ['disc', 'ring', 'square', 'dots'];
const FIESTA_KINDS: readonly FiestaKind[] = ['parol', 'sun', 'star'];
/** Shapes that hang (the parol) sway gently instead of spinning. */
const HANGING: ReadonlySet<ShapeKind> = new Set(['parol']);

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
  const fiesta = theme.shapes === 'fiesta';
  const shapes = Array.from({ length: level.count }, (_, i): BackdropShape => {
    const kind: ShapeKind = fiesta ? (FIESTA_KINDS[i % FIESTA_KINDS.length] as FiestaKind) : (KINDS[i % KINDS.length] as GeometricKind);
    const size = u * (0.035 + rand(i, 1) * (kind === 'dots' ? 0.03 : 0.09));
    const { x, y } = drift(i, size, 1, width, height, seconds, level);
    const spin = (rand(i, 8) - 0.5) * 0.6 * level.speed;
    const color = colors[i % colors.length] as string;
    if (HANGING.has(kind)) {
      // Hanging shapes sway a little around upright instead of turning over.
      const sway = Math.sin(seconds * (0.8 + rand(i, 10) * 0.6) * level.speed + rand(i, 9) * 6.28) * 0.14;
      return { kind, x, y, size, rotation: sway, color };
    }
    return { kind, x, y, size, rotation: rand(i, 9) * Math.PI + spin * seconds, color };
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
      case 'parol':
        drawParol(ctx, shape.size, u);
        return;
      case 'sun':
        drawSun(ctx, shape.size);
        return;
      case 'star':
        starPath(ctx, shape.size, shape.size * 0.45);
        ctx.fill();
        return;
    }
  });
}

/** A five-point star path centred on 0,0, point up. */
function starPath(ctx: Ctx2D, outer: number, inner: number): void {
  ctx.beginPath();
  for (let p = 0; p < 10; p += 1) {
    const r = p % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (p * Math.PI) / 5;
    if (p === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

/** A parol: a five-point star inside a ring, with two tails below. */
function drawParol(ctx: Ctx2D, size: number, u: number): void {
  ctx.lineWidth = Math.max(1, u * 0.008);
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.stroke();
  starPath(ctx, size * 0.82, size * 0.36);
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * size * 0.3, size * 0.95);
    ctx.lineTo(side * size * 0.45, size * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(side * size * 0.45, size * 2, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A sun: a disc with eight pointed rays. */
function drawSun(ctx: Ctx2D, size: number): void {
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
  ctx.fill();
  for (let r = 0; r < 8; r += 1) {
    const a = (r * Math.PI) / 4;
    const side = Math.PI / 22;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - side) * size * 0.55, Math.sin(a - side) * size * 0.55);
    ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
    ctx.lineTo(Math.cos(a + side) * size * 0.55, Math.sin(a + side) * size * 0.55);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * A string of banderitas across the frame (M12.7): it droops in scallops between invisible posts
 * every `period` px, at height `y`, and its flags travel along it (`dir` 1 = rightwards, -1 =
 * leftwards), wrapping round forever.
 */
export interface GarlandString {
  y: number;
  /** Distance between the posts the string droops between. */
  period: number;
  /** How far the string droops in the middle of each scallop. */
  sag: number;
  dir: 1 | -1;
  /** Start offset of the flags along the string, so the strings don't move in step. */
  phase: number;
  /** Distance from one flag to the next along the string. */
  spacing: number;
}

/** One flag: its top edge on the string from `left` to `right`, its tip hanging below. */
export interface GarlandFlag {
  left: number;
  right: number;
  /** Horizontal sway of the tip. */
  sway: number;
  color: string;
}

/**
 * Strings along the top edge for Fiesta shapes (1 for Subtle; Lively weaves a second one into the
 * same band, running the other way); none otherwise. They stay above where templates put their
 * titles (M12.7: strings lower down crossed titles and lists, especially in 16:9).
 */
export function garlandStrings(width: number, height: number, theme: Theme): GarlandString[] {
  if (theme.shapes !== 'fiesta' || !theme.motion || theme.motion === 'off') return [];
  const u = Math.min(width, height);
  const wide = width > height;
  const strings: GarlandString[] = wide
    ? [
        { y: height * 0.008, period: width * 0.25, sag: u * 0.025, dir: 1, phase: 0, spacing: u * 0.045 },
        { y: height * 0.016, period: width * 0.19, sag: u * 0.02, dir: -1, phase: u * 0.03, spacing: u * 0.045 },
      ]
    : [
        { y: height * 0.008, period: width * 0.5, sag: u * 0.035, dir: 1, phase: 0, spacing: u * 0.05 },
        { y: height * 0.014, period: width * 0.36, sag: u * 0.028, dir: -1, phase: u * 0.03, spacing: u * 0.05 },
      ];
  return strings.slice(0, LEVELS[theme.motion].garlands);
}

/** Height of a garland string at `x` (its scallops start at the left edge). */
export function garlandY(string: GarlandString, x: number): number {
  const f = wrap(x, 0, string.period) / string.period;
  return string.y + string.sag * Math.sin(Math.PI * f);
}

/** Each flag's width, as a share of the spacing between flags. */
const FLAG_WIDTH = 0.78;
/** How far a flag's tip hangs below the string, as a share of its width. */
const FLAG_DROP = 1.05;

/** The lowest point a string's flags reach (for keeping them clear of titles). */
export const garlandBottom = (string: GarlandString) => string.y + string.sag + string.spacing * FLAG_WIDTH * FLAG_DROP;

/**
 * The flags on a string at story time `storyMs` that are (at least partly) inside the frame. Each
 * keeps its colour as it travels (primary, accent, text in turn), so the run of colours moves along.
 */
export function garlandFlags(string: GarlandString, width: number, height: number, storyMs: number, theme: Theme): GarlandFlag[] {
  if (!theme.motion || theme.motion === 'off') return [];
  const u = Math.min(width, height);
  const { spacing } = string;
  const seconds = storyMs / 1000;
  const speed = u * 0.06 * (theme.motion === 'lively' ? 1.8 : 1) * string.dir;
  const offset = seconds * speed + string.phase;
  const colors = [theme.palette.primary, theme.palette.accent, theme.palette.text];
  const flagWidth = spacing * FLAG_WIDTH;
  const flags: GarlandFlag[] = [];
  for (let k = Math.floor(-offset / spacing) - 1; k * spacing + offset < width; k += 1) {
    const left = k * spacing + offset;
    if (left + flagWidth < 0) continue;
    flags.push({
      left,
      right: left + flagWidth,
      sway: Math.sin(seconds * 1.6 + k * 0.9) * flagWidth * 0.08,
      color: colors[((k % 3) + 3) % 3] as string,
    });
  }
  return flags;
}

function drawGarland(ctx: Ctx2D, string: GarlandString, width: number, height: number, storyMs: number, theme: Theme): void {
  const u = Math.min(width, height);
  ctx.strokeStyle = theme.palette.text;
  ctx.lineWidth = Math.max(1, u * 0.0042);
  ctx.beginPath();
  const step = Math.max(2, width / 160);
  for (let x = 0; x <= width + step; x += step) {
    if (x === 0) ctx.moveTo(x, garlandY(string, x));
    else ctx.lineTo(x, garlandY(string, x));
  }
  ctx.stroke();
  const drop = string.spacing * FLAG_WIDTH * FLAG_DROP;
  for (const flag of garlandFlags(string, width, height, storyMs, theme)) {
    const middle = (flag.left + flag.right) / 2;
    ctx.fillStyle = flag.color;
    ctx.beginPath();
    ctx.moveTo(flag.left, garlandY(string, flag.left));
    ctx.lineTo(flag.right, garlandY(string, flag.right));
    ctx.lineTo(middle + flag.sway, garlandY(string, middle) + drop);
    ctx.closePath();
    ctx.fill();
  }
}

/** Draw only the moving shapes (no fill): the drifting shapes, then any banderitas strings. */
export function drawBackdrop(ctx: Ctx2D, width: number, height: number, storyMs: number, theme: Theme): void {
  const shapes = backdropShapes(width, height, storyMs, theme);
  if (shapes.length === 0) return;
  const level = LEVELS[theme.motion as Exclude<BackgroundMotion, 'off'>];
  const u = Math.min(width, height);
  withAlpha(ctx, level.alpha, () => shapes.forEach((shape) => drawShape(ctx, shape, u)));
  const strings = garlandStrings(width, height, theme);
  if (strings.length > 0) {
    withAlpha(ctx, level.garlandAlpha, () => strings.forEach((string) => drawGarland(ctx, string, width, height, storyMs, theme)));
  }
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
