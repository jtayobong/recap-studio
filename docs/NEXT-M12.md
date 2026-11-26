# M12, photo carousel upgrades and background dots: 🚧 in progress

**Goal:** five changes the user asked for after M11, four of them to the Photo carousel:
a step-and-pause movement like the text carousel's, a way to stop cropping photos, more slots,
a quicker way to fill them, and single dots in the Subtle background.

**Done when:** the Photo carousel has *Movement* (Smooth glide / Stop at each photo) and *Photo fit*
(Fill the card / Show whole photo), both defaulting to today's behaviour so existing scenes render
exactly as before (portrait baseline unchanged for old field values); it takes up to 12 photos or
clips, shows how long each one is on screen, and "Add photos…" fills the next empty slots from a
multi-select library picker. Subtle background motion also draws a few single dots; Off is
unchanged. `npm run check`, `npm run test:e2e` and `npm run test:e2e:prod` pass.

## Decisions (user, 2026-11-27)

- **Stop at each photo** is an option next to direction, not a replacement: smooth glide stays the
  default.
- **"Zoom focus"** turned out to mean the crop to the card shape (the focus point). The option is
  one *Photo fit* choice for the whole carousel, not one per photo (the grid has one per cell, but
  with 12 photos that's 12 clicks).
- **More photos**: Claude proposed a cap of 12 rather than unlimited (time per photo gets too short
  to read beyond that, an unlimited list would need a new list field kind plus a migration, and
  every clip costs a decoder in export), plus a quicker way to fill slots. The user agreed.
- **Single dots** are added to Subtle only; Lively is left as it is.

## 1. Movement: stop at each photo

- New choice field `movement`: `'glide'` (default) / `'step'`.
- Step uses the text carousel's timing, moved to `mediaLayout.ts` as `stepPosition(t, duration,
  count)` (equal beat per card, hold, move at the end of the beat in ≤ 650 ms, last card holds).
  The text carousel calls the same function, so its output is unchanged. The photo carousel starts
  with its first card centred (no slide-in), like glide does.
- Clips keep playing on scene time while the strip holds.

## 2. Photo fit

- New choice field `fit`: `'cover'` (default, "Fill the card (crop)") / `'contain'` ("Show whole
  photo"). Every slot's `focus.fit` points at it, so the focus picker drops the crop outline when
  nothing is cropped. Contain draws a dimmed, cropped copy behind the whole photo, as the grid does.

## 3. Single dots in Subtle

- `LEVELS.subtle` gets `singles: 6`: small round dots (radius ≈ 0.6–1.1 % of the shorter side),
  drifting a bit slower than the shapes, same deterministic story-time math. Off and Lively are
  unchanged.

## 4. Up to 12 slots

- `CAROUSEL_SLOTS = 12`. Old scenes only gain empty fields (`resolveFields` fills defaults), so no
  migration. Slots still appear one at a time.
- The inspector shows "N photos · about X s each" for the carousel (the scene length ÷ N), so it's
  visible when the scene needs to be longer. Not done: growing the scene length automatically in
  step mode (needs to know whether the user set the length, i.e. a schema change).

## 5. Add several at once

- A template can name its ordered media slots (`mediaSequence` on the template); the carousel does.
- The inspector shows **Add photos…** for such templates: a library picker with a checkbox per
  photo or clip, in library order; "Add N" fills the next empty slots in slot order as one undo
  step. When fewer slots are free than picked, the button says how many fit.

## Progress

- Design record written (this file).
