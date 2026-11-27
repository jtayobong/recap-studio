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
 * Fiesta shapes that drift (M13): tropical leaves that fall and flutter, guitars that sway, notes
 * (one, or two joined) that float up, jeepneys that drive across the lower half, and the sun. The
 * banderitas are strings along the top edge instead (`garlandStrings`, M12.7).
 */
type FiestaKind = 'leaf' | 'guitar' | 'note' | 'notes' | 'jeepney' | 'sun';
type ShapeKind = GeometricKind | FiestaKind | 'dot';
const KINDS: readonly GeometricKind[] = ['disc', 'ring', 'square', 'dots'];

/**
 * The fiesta mix per level, in order (leaves are the most common; jeepneys come in light traffic).
 * Notes alternate between one note and two joined ones (see `fiestaShapes`).
 */
const FIESTA_MIX: Record<Exclude<BackgroundMotion, 'off'>, readonly Exclude<FiestaKind, 'notes'>[]> = {
  subtle: ['leaf', 'jeepney', 'note', 'leaf', 'guitar', 'leaf', 'sun', 'jeepney', 'leaf'],
  lively: ['leaf', 'note', 'jeepney', 'leaf', 'guitar', 'leaf', 'sun', 'note', 'jeepney', 'leaf', 'guitar', 'leaf', 'note', 'jeepney', 'sun', 'leaf'],
};

export interface BackdropShape {
  kind: ShapeKind;
  x: number;
  y: number;
  /** Size in pixels (radius for round shapes, half side for squares, half length for the others). */
  size: number;
  rotation: number;
  color: string;
  /** A second colour for two-tone shapes (Lively leaves and notes, M13). */
  color2?: string;
  /** -1 mirrors the shape left to right (a jeepney driving left). */
  flip?: 1 | -1;
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

/** Seed offset for the fiesta shapes, so they don't share paths with the geometric ones. */
const FIESTA_SEED = 2000;

/** The fiesta shapes (M13) at `seconds`: each kind moves its own way. */
function fiestaShapes(width: number, height: number, seconds: number, theme: Theme, motion: Exclude<BackgroundMotion, 'off'>): BackdropShape[] {
  const level = LEVELS[motion];
  const u = Math.min(width, height);
  const palette = [theme.palette.primary, theme.palette.accent, theme.palette.text];
  const pick = (n: number) => palette[((n % 3) + 3) % 3] as string;
  let jeepneys = 0;
  return FIESTA_MIX[motion].map((base, i): BackdropShape => {
    const seed = FIESTA_SEED + i;
    const kind: FiestaKind = base === 'note' && i % 2 === 1 ? 'notes' : base;
    const color = pick(i);
    // Lively leaves and notes are two-toned, each with its own pair of palette colours.
    const twoTone = motion === 'lively' && (kind === 'leaf' || kind === 'note' || kind === 'notes');
    const color2 = twoTone ? pick(i + 1 + ((i >> 1) % 2)) : undefined;
    if (kind === 'jeepney') {
      // Drives across the lower half, facing the way it goes, with a little bounce.
      const size = u * 0.077;
      const dir: 1 | -1 = jeepneys % 2 === 1 ? 1 : -1;
      jeepneys += 1;
      const speed = u * (0.045 + rand(seed, 3) * 0.02) * level.speed;
      const x = wrap(rand(seed, 4) * width + dir * speed * seconds, -size * 1.3, width + size * 2.6);
      const y = height * (0.55 + rand(seed, 7) * 0.38) - Math.abs(Math.sin(seconds * 6 + i)) * u * 0.003;
      return { kind, x, y, size, rotation: 0, color, flip: dir };
    }
    const size = u * (0.045 + rand(seed, 1) * 0.06);
    const margin = size * 2;
    if (kind === 'leaf') {
      // Falls slowly at a slant, swinging side to side and fluttering.
      const speed = u * 0.035 * level.speed;
      const x = wrap(rand(seed, 4) * width + Math.sin(seconds * 0.8 + i) * u * 0.05 + speed * 0.4 * seconds, -margin, width + margin * 2);
      const y = wrap(rand(seed, 7) * height + speed * seconds, -margin, height + margin * 2);
      const rotation = rand(seed, 9) * Math.PI * 2 + Math.sin(seconds * 1.3 * level.speed + i) * 0.7;
      return { kind, x, y, size, rotation, color, color2 };
    }
    if (kind === 'note' || kind === 'notes') {
      // Floats up with a slight wobble, like rising music.
      const speed = u * 0.03 * level.speed;
      const x = wrap(rand(seed, 4) * width + Math.sin(seconds * 1.1 + i) * u * 0.03, -margin, width + margin * 2);
      const y = wrap(rand(seed, 7) * height - speed * seconds, -margin, height + margin * 2);
      return { kind, x, y, size, rotation: Math.sin(seconds * 1.5 + i) * 0.2, color, color2 };
    }
    const { x, y } = drift(seed, size, 1, width, height, seconds, level);
    // The sun turns slowly; a guitar sways a little around upright.
    const rotation =
      kind === 'sun'
        ? rand(seed, 9) * Math.PI + seconds * 0.2
        : Math.sin(seconds * (0.8 + rand(seed, 10) * 0.6) * level.speed + rand(seed, 9) * 6.28) * 0.14;
    return { kind, x, y, size, rotation, color };
  });
}

/** The shapes at story time `storyMs` (exported for tests). Empty when motion is off. */
export function backdropShapes(width: number, height: number, storyMs: number, theme: Theme): BackdropShape[] {
  if (!theme.motion || theme.motion === 'off') return [];
  const seconds = storyMs / 1000;
  if (theme.shapes === 'fiesta') return fiestaShapes(width, height, seconds, theme, theme.motion);
  const level = LEVELS[theme.motion];
  const u = Math.min(width, height);
  const colors = [theme.palette.primary, theme.palette.accent, theme.palette.text, theme.palette.primary];
  const shapes = Array.from({ length: level.count }, (_, i): BackdropShape => {
    const kind = KINDS[i % KINDS.length] as GeometricKind;
    const size = u * (0.035 + rand(i, 1) * (kind === 'dots' ? 0.03 : 0.09));
    const { x, y } = drift(i, size, 1, width, height, seconds, level);
    const spin = (rand(i, 8) - 0.5) * 0.6 * level.speed;
    const color = colors[i % colors.length] as string;
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
    if (shape.flip === -1) ctx.scale(-1, 1);
    ctx.fillStyle = shape.color;
    ctx.strokeStyle = shape.color;
    const s = shape.size;
    switch (shape.kind) {
      case 'disc':
      case 'dot':
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fill();
        return;
      case 'ring':
        ctx.lineWidth = u * 0.012;
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.stroke();
        return;
      case 'square':
        ctx.lineWidth = u * 0.012;
        ctx.strokeRect(-s, -s, s * 2, s * 2);
        return;
      case 'dots':
        for (let d = 0; d < 3; d += 1) {
          ctx.beginPath();
          ctx.arc((d - 1) * s * 0.9, 0, s * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      case 'sun':
        fillOnce(ctx, () => sunPath(ctx, s));
        return;
      case 'guitar':
        fillOnce(ctx, () => guitarPath(ctx, s));
        return;
      case 'jeepney':
        fillOnce(ctx, () => jeepneyPath(ctx, s));
        return;
      case 'leaf':
        drawLeaf(ctx, s, shape.color, shape.color2);
        return;
      case 'note':
      case 'notes':
        drawNote(ctx, s, shape.kind === 'notes', shape.color, shape.color2);
        return;
    }
  });
}

/*
 * Fiesta shape paths (M13). Each shape (or each colour of a two-tone shape) is one path filled
 * once with the nonzero rule, so it is evenly see-through: no darker spots where its parts meet.
 * Outlines run clockwise; holes (sound hole, windows, hubs, the leaf's midrib) run anticlockwise,
 * so they are cut out of the same path.
 */

/** One fill of the path that `build` adds. */
function fillOnce(ctx: Ctx2D, build: () => void): void {
  ctx.beginPath();
  build();
  ctx.fill('nonzero');
}

type Point = readonly [number, number];

function polygon(ctx: Ctx2D, points: readonly Point[]): void {
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
}

/** A rectangle: clockwise (an outline) or anticlockwise (a hole). */
function rectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, hole = false): void {
  const corners: Point[] = hole
    ? [[x, y], [x, y + h], [x + w, y + h], [x + w, y]]
    : [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  polygon(ctx, corners);
}

function circlePath(ctx: Ctx2D, cx: number, cy: number, r: number, hole = false): void {
  ctx.moveTo(cx + r, cy);
  ctx.arc(cx, cy, r, 0, Math.PI * 2, hole);
}

/** A sun: a disc with eight pointed rays. */
function sunPath(ctx: Ctx2D, s: number): void {
  circlePath(ctx, 0, 0, s * 0.42);
  const side = Math.PI / 22;
  for (let r = 0; r < 8; r += 1) {
    const a = (r * Math.PI) / 4;
    polygon(ctx, [
      [Math.cos(a - side) * s * 0.55, Math.sin(a - side) * s * 0.55],
      [Math.cos(a) * s, Math.sin(a) * s],
      [Math.cos(a + side) * s * 0.55, Math.sin(a + side) * s * 0.55],
    ]);
  }
}

/** An acoustic guitar, head up: body with a sound hole and a bridge slot, neck and headstock. */
function guitarPath(ctx: Ctx2D, s: number): void {
  ctx.moveTo(0, -s * 0.2);
  ctx.bezierCurveTo(s * 0.42, -s * 0.25, s * 0.42, s * 0.12, s * 0.26, s * 0.2);
  ctx.bezierCurveTo(s * 0.62, s * 0.3, s * 0.62, s * 0.95, 0, s * 0.95);
  ctx.bezierCurveTo(-s * 0.62, s * 0.95, -s * 0.62, s * 0.3, -s * 0.26, s * 0.2);
  ctx.bezierCurveTo(-s * 0.42, s * 0.12, -s * 0.42, -s * 0.25, 0, -s * 0.2);
  ctx.closePath();
  circlePath(ctx, 0, s * 0.22, s * 0.14, true);
  rectPath(ctx, -s * 0.16, s * 0.58, s * 0.32, s * 0.07, true);
  rectPath(ctx, -s * 0.06, -s, s * 0.12, s * 0.85);
  rectPath(ctx, -s * 0.1, -s * 1.22, s * 0.2, s * 0.24);
}

/** A jeepney from the side, facing right: long hood, side windows, wheels, antenna, roof rack. */
function jeepneyPath(ctx: Ctx2D, s: number): void {
  polygon(ctx, [
    [-s, s * 0.2],
    [-s, -s * 0.45],
    [-s * 1.05, -s * 0.5],
    [s * 0.38, -s * 0.5],
    [s * 0.5, -s * 0.12],
    [s * 0.96, -s * 0.08],
    [s, s * 0.2],
  ]);
  for (let w = 0; w < 5; w += 1) rectPath(ctx, -s * 0.9 + w * s * 0.25, -s * 0.4, s * 0.19, s * 0.2, true);
  // Windscreen (a hole, so anticlockwise).
  polygon(ctx, [
    [s * 0.33, -s * 0.2],
    [s * 0.42, -s * 0.2],
    [s * 0.37, -s * 0.4],
    [s * 0.33, -s * 0.4],
  ]);
  for (const wx of [-s * 0.6, s * 0.62]) {
    circlePath(ctx, wx, s * 0.24, s * 0.19);
    circlePath(ctx, wx, s * 0.24, s * 0.08, true);
  }
  rectPath(ctx, -s * 1.05, -s * 0.58, s * 1.4, s * 0.05);
  // Antenna on the hood, with a ball on top.
  const across = Math.atan2(-0.29, 0.1) + Math.PI / 2;
  const dx = Math.cos(across) * s * 0.02;
  const dy = Math.sin(across) * s * 0.02;
  polygon(ctx, [
    [s * 0.8 - dx, -s * 0.09 - dy],
    [s * 0.9 - dx, -s * 0.38 - dy],
    [s * 0.9 + dx, -s * 0.38 + dy],
    [s * 0.8 + dx, -s * 0.09 + dy],
  ]);
  circlePath(ctx, s * 0.9, -s * 0.4, s * 0.04);
}

/** A tropical leaf, tip up, with its midrib cut out and a short stem. */
function leafPath(ctx: Ctx2D, s: number): void {
  ctx.moveTo(0, -s);
  ctx.bezierCurveTo(s * 0.55, -s * 0.45, s * 0.45, s * 0.45, 0, s);
  ctx.bezierCurveTo(-s * 0.4, s * 0.45, -s * 0.55, -s * 0.45, 0, -s);
  ctx.closePath();
  rectPath(ctx, -s * 0.025, -s * 0.8, s * 0.05, s * 1.65, true);
  rectPath(ctx, -s * 0.03, s * 0.9, s * 0.06, s * 0.36);
}

/** A leaf in one colour, or two-toned: each half (split at the midrib) in its own colour. */
function drawLeaf(ctx: Ctx2D, s: number, color: string, color2: string | undefined): void {
  if (!color2) {
    fillOnce(ctx, () => leafPath(ctx, s));
    return;
  }
  const big = s * 2;
  for (const [x, fill] of [[-big, color], [0, color2]] as const) {
    isolated(ctx, () => {
      ctx.beginPath();
      ctx.rect(x, -big, big, big * 2);
      ctx.clip();
      ctx.fillStyle = fill;
      fillOnce(ctx, () => leafPath(ctx, s));
    });
  }
}

/** Note heads: one, or two for joined notes. */
function noteHeads(s: number, pair: boolean): readonly Point[] {
  return pair
    ? [
        [-s * 0.5, s * 0.62],
        [s * 0.38, s * 0.45],
      ]
    : [[-s * 0.15, s * 0.6]];
}

function noteHeadsPath(ctx: Ctx2D, s: number, pair: boolean): void {
  for (const [hx, hy] of noteHeads(s, pair)) {
    ctx.moveTo(hx + Math.cos(-0.4) * s * 0.27, hy + Math.sin(-0.4) * s * 0.27);
    ctx.ellipse(hx, hy, s * 0.27, s * 0.19, -0.4, 0, Math.PI * 2);
  }
}

/** Stem and flag (one note), or two stems and a beam (two joined notes). */
function noteStemsPath(ctx: Ctx2D, s: number, pair: boolean): void {
  if (!pair) {
    rectPath(ctx, s * 0.06, -s * 0.75, s * 0.07, s * 1.33);
    ctx.moveTo(s * 0.13, -s * 0.75);
    ctx.quadraticCurveTo(s * 0.6, -s * 0.4, s * 0.38, s * 0.05);
    ctx.quadraticCurveTo(s * 0.45, -s * 0.35, s * 0.13, -s * 0.45);
    ctx.closePath();
    return;
  }
  rectPath(ctx, -s * 0.3, -s * 0.7, s * 0.07, s * 1.28);
  rectPath(ctx, s * 0.58, -s * 0.86, s * 0.07, s * 1.27);
  polygon(ctx, [
    [-s * 0.3, -s * 0.7],
    [s * 0.65, -s * 0.86],
    [s * 0.65, -s * 0.66],
    [-s * 0.3, -s * 0.5],
  ]);
}

/** A note (or two joined) in one colour, or two-toned: heads in one, stems and flag or beam in the other. */
function drawNote(ctx: Ctx2D, s: number, pair: boolean, color: string, color2: string | undefined): void {
  if (!color2) {
    fillOnce(ctx, () => {
      noteHeadsPath(ctx, s, pair);
      noteStemsPath(ctx, s, pair);
    });
    return;
  }
  ctx.fillStyle = color;
  fillOnce(ctx, () => noteHeadsPath(ctx, s, pair));
  isolated(ctx, () => {
    // Stems and flags everywhere except over the heads, so the two colours never overlap.
    ctx.beginPath();
    ctx.rect(-s * 3, -s * 3, s * 6, s * 6);
    noteHeadsPath(ctx, s, pair);
    ctx.clip('evenodd');
    ctx.fillStyle = color2;
    fillOnce(ctx, () => noteStemsPath(ctx, s, pair));
  });
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
