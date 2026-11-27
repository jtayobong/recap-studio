# M13, new Fiesta shapes: ✅ done (2026-11-27)

**Goal:** the Fiesta background shapes (M12.3) lose their stars and parol lanterns and gain
tropical leaves, guitars, music notes and jeepneys. The sun and the banderitas strings along the
top edge (M12.7) stay.

**Done when:** Fiesta drifts leaves, guitars, notes and jeepneys (plus the sun) in 9:16 and 16:9,
every shape is evenly see-through, the export matches the preview, Geometric is unchanged.
`npm run check`, `npm run test:e2e` and `npm run test:e2e:prod` pass.

## Decisions (user, 2026-11-27, from animated previews)

- **Shapes:** leaf (elongated tropical leaf with a midrib), acoustic guitar (sound hole, bridge
  slot, neck, headstock), notes (one with a flag, or two joined by a beam, in turns), jeepney (side
  view: long hood, five side windows, windscreen, wheels with hubs, roof rack, antenna). The sun
  stays.
- **Even transparency:** the first previews drew each shape from several overlapping fills, so the
  joins looked darker. Each shape is now **one path filled once** (nonzero rule): outlines
  clockwise, holes anticlockwise.
- **Two-tone leaves and notes in Lively:** a leaf's halves (split at the midrib) and a note's heads
  vs. its stems/flag/beam are in two palette colours, with the pairs varying per icon. The two
  colours never overlap (each half is clipped; stems are clipped away from the heads). Subtle
  shapes are one colour each.
- **More and smaller jeepneys:** 2 in Subtle, 3 in Lively, at 0.077 × the shorter side (70 % of
  the first preview), driving both ways across the lower half, facing the way they go.
- **More leaves:** Subtle 9 shapes (4 leaves, 2 jeepneys, note, guitar, sun); Lively 16 (6 leaves,
  3 notes, 3 jeepneys, 2 guitars, 2 suns). Fiesta has no single dots (as previewed).

## Movement (story time, deterministic)

- Leaves fall at a slant, swinging and fluttering. Notes float up with a wobble. Jeepneys drive
  sideways with a small bounce and never rotate. The guitar sways around upright; the sun turns.
- Fiesta shapes use their own seeds (`FIESTA_SEED`), so Geometric shapes and their positions are
  untouched.

## Progress

- `render/backdrop.ts`: `FIESTA_MIX`, `fiestaShapes`, single-fill paths (`guitarPath`,
  `jeepneyPath`, `leafPath`, `sunPath`, note heads/stems), two-tone `drawLeaf`/`drawNote`;
  parol and star removed. Unit tests in `backdrop.test.ts` (mix and counts, jeepneys sideways in
  the lower half facing their way, leaves fall and notes rise, two-tone colours only in Lively,
  one fill per one-colour shape). Checked in the editor in 9:16 and 16:9 (Parol Night, Lively).
