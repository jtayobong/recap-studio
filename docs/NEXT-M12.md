# M12, photo carousel upgrades and background dots: ✅ done (2026-11-27)

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
  step mode (needs to know whether the user set the length, i.e. a schema change). Decision D38.

## 5. Add several at once

- A template can name its ordered media slots (`mediaSequence` on the template); the carousel does.
- The inspector shows **Add photos…** for such templates: a library picker with a toggle per
  photo or clip, numbered in the order they were picked; "Add N" fills the next empty slots in slot
  order, in pick order, as one undo step. When more are picked than slots are free, the dialog says
  only the first N will be added, and the inspector says how many didn't fit.

## M12.1: photo grid Slow zoom switch

- The user's first reading of item 2 (the photo grid's slow 1 → 1.08 zoom) became its own small
  change: a `slowZoom` boolean field on the Photo grid, on by default, so existing grids render
  exactly as before (portrait baseline unchanged). Off draws every cell at zoom 1.

## M12.2: carousel strip centred without a title

- With an empty title, the photo carousel's strip still sat lower (at 52–58 % of the height) to
  leave room for a title that wasn't there. `carouselCards` and `textCarouselCards` take a `titled`
  flag: without a title the centred card is centred in the frame (50 %), in both directions and
  shapes. The text carousel had the same offset (also for its vertical progress dots) and gets the
  same fix. Titled scenes are unchanged (portrait baseline identical).

## M12.3: fiesta palettes and shapes

- **Five palettes** leaning towards Filipino fiesta colours: *Banderitas* (cream, magenta,
  turquoise), *Parol Night* (indigo, lantern gold, pink), *Sinag* (royal blue, sun yellow, coral
  red), *Mango Ube* (ube, mango, pandan) and *Jeepney* (red, chrome yellow, navy). Sinag's red and
  Jeepney's sky-blue accent were too close to their backgrounds (1.7:1, the palette test asks for
  2:1), so Sinag uses a lighter coral red and Jeepney a navy accent.
- **Background shapes** (user decision: a story setting, option A): `style.backgroundShapes`,
  `'geometric' | 'fiesta'`, schema v5. Existing projects migrate to `geometric` and look exactly as
  before; new projects also start on Geometric. *Fiesta* swaps the four geometric shapes for a
  string of banderitas, a parol (star in a ring with two tails), an eight-ray sun and a star; the
  hanging ones (banderitas, parol) sway around upright instead of spinning. Same drift, count and
  single dots as Geometric. The picker sits under *Background motion* and is disabled when motion
  is off. Decision D39.
- Fixed in passing: the palette picker keyed its swatches by colour, so Mono Ink (primary = text =
  `#111111`) logged a React duplicate-key warning.

## M12.4: music starts with a chosen scene

- `audio.startSceneId` (optional; schema v6, a version-only migration so an older app says "saved
  by a newer version" instead of silently dropping it). Picked in the Music section as *Music
  starts with* (Scene 1 = the story start, stored as no value). The music follows its scene when
  scenes move; a deleted scene falls back to the story start.
- `domain/music.ts` gained `musicStartMs(track, scenes)` and a `startMs` argument on
  `songTimeMs`/`musicEndMs`/`musicGain`, so the preview (`musicSync`) and the export mix
  (`MixPlan.music.startMs`, read only from there) start, fade in and stop identically. The song
  plays from its own start point (*Start the song at*) at the moment the scene starts. Decision D40.

## M12.5: Encore scene ("One more thing…")

- The user asked for a scene like the famous keynote "one more thing" slide. It's an original
  template named *Encore* (no company names or branding, as for Wrapped): `render/templates/encore.ts`,
  offered before Outro.
- Fields: *Look* (Black stage / Story colours), *First line* (default "One more thing…"), *Reveal*
  (optional, default "See you in 2027") and *Small line* (optional).
- Beats as shares of the scene (`ENCORE_BEATS`), so a shorter or longer scene keeps its rhythm: the
  first line fades in (6–20 %), a trailing "…" or "..." is drawn as three dots appearing one by one
  (22–38 %), then with a reveal the line fades out (48–56 %) and the reveal grows into place
  (58–70 %), its small line after (70–80 %). Without a reveal the line holds to the end.
- *Black stage* deliberately skips `fillBackground`: pure black with white text and no background
  motion, which is what makes the moment. *Story colours* uses the palette (reveal in the primary
  colour) and the story's background motion. Decision D41.

## M12.6: framed Photo / Video

- The user wanted solo photos and clips not to fill the whole screen. Photo / Video gained a
  *Layout* field: *Framed* (with padding) or *Full screen*.
- Framed (`framedCard`): portrait, a card 86 % × 70 % of the frame near the top, the caption centred
  in the space below it on the background (no band); landscape, a card 58 % × 84 % on the left and
  the caption in a column on the right. Without a caption the card is centred. Rounded corners,
  settles in from 96 %. Ken Burns zoom, fit and focus work inside the card; the focus picker shows
  the card's shape (`focus.aspect` on `layout`).
- New scenes start Framed (the field's default). Schema v7 migrates every existing Photo / Video
  scene to `layout: 'full'`, so old projects render exactly as before (portrait baseline identical
  with photo scenes on Full screen; the baseline now pins them to it). Decision D42.

## M12.7: banderitas strings along the top edge

- The drifting banderitas pieces looked odd. Previews of three layouts (overhead strings, top and
  bottom, straight criss-cross) were shown in 9:16 and 16:9; the user picked overhead. In real
  scenes the overhead strings crossed titles and lists (Top 5, carousels, worst in 16:9), so,
  with the user, they became **edge only** and **fainter**.
- `garlandStrings`: one string along the top edge for Subtle; Lively weaves a second one into the
  same band, running the other way. Each droops in scallops between invisible posts
  (`garlandY`); flags (`garlandFlags`) travel along it forever on story time, each keeping its
  colour (primary, accent, text in turn), with a slight sway. Flag tips stay above 6 % (9:16) /
  7.5 % (16:9) of the height (`garlandBottom`, tested), where templates start their titles.
- Opacity 0.4 (Subtle) / 0.5 (Lively): a little clearer than the drifting shapes, still soft.
  Parols, suns and stars keep drifting; Geometric is unchanged.

## Progress

- Design record written (this file).
- **Stop at each photo done:** `movement` field, `carouselStripPosition`; the step timing moved to
  `mediaLayout.stepPosition` (text carousel unchanged). Unit test in `templates.test.ts`.
- **Photo fit done:** `fit` field shared by every slot's focus binding. Unit test (contain draws the
  whole source over a dimmed backdrop).
- **Single dots done:** `LEVELS.subtle.singles = 6`, seeded apart from the other shapes so those
  stay where they were. Unit test in `backdrop.test.ts`.
- **12 slots done:** `CAROUSEL_SLOTS = 12`, "about X s each" in the inspector (`editor/mediaSequence.ts`).
  The portrait baseline changed only for the carousel *with every slot filled* (the baseline fills
  all `media*` fields, so 12 cards instead of 6); everything else, and carousels with ≤ 6 photos,
  are identical.
- **Add photos… done:** `MediaSequenceSection`, `addSceneMedia` (unit tests), `e2e/m12.spec.ts`
  (pick order, undo, the 12 cap, the new options in the inspector).
