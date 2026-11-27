import { withAlpha, type Ctx2D } from '../context';
import { easeOutCubic, lerp, progress } from '../easing';
import { cssFont, fitSingleLine, fitText, measureWidth, type FontSpec } from '../text';
import { isLandscape, unitOf } from '../layout';
import { fillBackground } from '../backdrop';
import { defineTemplate } from './types';

/** The black stage look: pure black, white text, nothing moving behind it. */
const STAGE = { background: '#000000', text: '#ffffff' };

/**
 * When each beat happens, as shares of the scene, so a shorter or longer scene keeps the rhythm:
 * the lead line fades in, its dots appear one by one, then (with a reveal) it fades out and the
 * reveal comes in.
 */
export const ENCORE_BEATS = {
  leadIn: [0.06, 0.14],
  dots: [0.22, 0.28, 0.34],
  dotFade: 0.04,
  leadOut: [0.48, 0.08],
  revealIn: [0.58, 0.12],
  detailIn: [0.7, 0.1],
} as const;

/** "One more thing…" / "One more thing..." → base text and whether to animate the dots. */
export function splitEllipsis(text: string): { base: string; dots: boolean } {
  const trimmed = text.trim();
  if (trimmed.endsWith('…')) return { base: trimmed.slice(0, -1), dots: true };
  if (trimmed.endsWith('...')) return { base: trimmed.slice(0, -3), dots: true };
  return { base: trimmed, dots: false };
}

/** Draw `base` and up to three dots (each with its own opacity), centred on `cx` as a whole. */
function drawLead(ctx: Ctx2D, base: string, dotAlphas: readonly number[], font: FontSpec, sizePx: number, cx: number, y: number): void {
  const baseWidth = measureWidth(ctx, base, font, sizePx);
  const dotWidth = measureWidth(ctx, '.', font, sizePx);
  const left = cx - (baseWidth + dotWidth * dotAlphas.length) / 2;
  ctx.font = cssFont(font, sizePx);
  ctx.textAlign = 'left';
  ctx.fillText(base, left, y);
  dotAlphas.forEach((alpha, i) => withAlpha(ctx, alpha, () => ctx.fillText('.', left + baseWidth + i * dotWidth, y)));
}

/**
 * A dramatic pause before one last reveal: "One more thing…" on a quiet stage, then (optionally)
 * the reveal itself. An original take on the keynote "one more thing" moment.
 */
export const encoreTemplate = defineTemplate({
  id: 'encore',
  name: 'Encore',
  // Avoid "pause"/"play" here: the gallery card's accessible name includes this text, and it
  // would then also match the player's Pause button.
  description: 'A dramatic beat before one last reveal: “One more thing…”',
  defaultDurationMs: 5000,
  defaultTransition: 'fade',
  posterMs: 4300,
  fields: {
    look: {
      kind: 'choice',
      label: 'Look',
      default: 'stage',
      options: [
        { value: 'stage', label: 'Black stage' },
        { value: 'story', label: 'Story colours' },
      ],
    },
    lead: { kind: 'text', label: 'First line', default: 'One more thing…', maxLength: 40 },
    reveal: { kind: 'text', label: 'Reveal (optional)', default: 'See you in 2027', maxLength: 60, multiline: true },
    detail: { kind: 'text', label: 'Small line (optional)', default: '', maxLength: 80, multiline: true },
  },

  render(ctx, frame, values, theme) {
    const { palette, fonts } = theme;
    const { width: W, height: H, localMs: t, durationMs: D } = frame;
    const u = unitOf(frame);
    const wide = isLandscape(frame);
    const stage = values.look !== 'story';
    const textColor = stage ? STAGE.text : palette.text;
    const at = (share: number) => share * D;
    const B = ENCORE_BEATS;

    if (stage) {
      // The stage look is deliberately still: no background motion, just black.
      ctx.fillStyle = STAGE.background;
      ctx.fillRect(0, 0, W, H);
    } else {
      fillBackground(ctx, frame, theme);
    }
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'alphabetic';

    const reveal = values.reveal.trim();
    const detail = values.detail.trim();

    // Lead line: fades in, dots appear one by one; fades out before a reveal.
    const { base, dots } = splitEllipsis(values.lead);
    const leadFont = { family: fonts.body, weight: 600 };
    const leadSize = fitSingleLine(ctx, base + (dots ? '...' : ''), leadFont, W * (wide ? 0.7 : 0.84), u * 0.085, u * 0.04);
    const leadIn = easeOutCubic(progress(t, at(B.leadIn[0]), at(B.leadIn[1])));
    const leadOut = reveal ? 1 - easeOutCubic(progress(t, at(B.leadOut[0]), at(B.leadOut[1]))) : 1;
    const leadAlpha = leadIn * leadOut;
    if ((base || dots) && leadAlpha > 0) {
      const dotAlphas = dots ? B.dots.map((start) => progress(t, at(start), at(B.dotFade))) : [];
      withAlpha(ctx, leadAlpha, () => drawLead(ctx, base, dotAlphas, leadFont, leadSize, W / 2, H / 2 + leadSize * 0.35 - (1 - leadIn) * u * 0.02));
    }

    if (!reveal) return;

    // Reveal: a big headline growing gently into place, with an optional small line under it.
    const revealFont = { family: fonts.display, weight: 900 };
    const fitted = fitText(ctx, reveal, {
      font: revealFont,
      maxWidth: W * (wide ? 0.72 : 0.84),
      maxHeight: H * (wide ? 0.4 : 0.26),
      maxSize: u * 0.16,
      minSize: u * 0.06,
      lineHeight: 1.02,
      maxLines: 3,
    });
    const enter = easeOutCubic(progress(t, at(B.revealIn[0]), at(B.revealIn[1])));
    if (enter <= 0) return;
    const blockHeight = fitted.lines.length * fitted.lineHeightPx;
    const top = H / 2 - blockHeight / 2 - (detail ? u * 0.04 : 0);
    const scale = lerp(0.94, 1, enter);
    withAlpha(ctx, enter, () => {
      ctx.font = cssFont(revealFont, fitted.sizePx * scale);
      ctx.textAlign = 'center';
      ctx.fillStyle = stage ? STAGE.text : palette.primary;
      fitted.lines.forEach((line, i) => ctx.fillText(line, W / 2, top + fitted.sizePx * 0.85 + i * fitted.lineHeightPx));
    });

    if (!detail) return;
    const detailFont = { family: fonts.body, weight: 600 };
    const small = fitText(ctx, detail, {
      font: detailFont,
      maxWidth: W * (wide ? 0.6 : 0.8),
      maxHeight: H * 0.1,
      maxSize: u * 0.05,
      minSize: u * 0.03,
      lineHeight: 1.3,
      maxLines: 2,
    });
    const detailEnter = easeOutCubic(progress(t, at(B.detailIn[0]), at(B.detailIn[1])));
    const detailTop = top + blockHeight + u * 0.05;
    withAlpha(ctx, detailEnter * 0.7, () => {
      ctx.font = cssFont(detailFont, small.sizePx);
      ctx.textAlign = 'center';
      ctx.fillStyle = textColor;
      small.lines.forEach((line, i) => ctx.fillText(line, W / 2, detailTop + small.sizePx + i * small.lineHeightPx + (1 - detailEnter) * u * 0.015));
    });
  },
});
