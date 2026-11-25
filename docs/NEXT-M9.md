# Next: after the original roadmap (M0–M8 done)

The plan in `PLAN.md` is complete: a fresh user can go from a starter story, through their own
numbers, photos, clips and music, to a downloaded MP4, with tested failure paths along the way.
This note collects candidates for what comes next. Landscape output is planned in detail and its
open questions are answered; the other candidates are still undecided.

## Candidates

### 1. Landscape (16:9) output (planned 2026-11-25; was "M8.1")

**Goal:** a project can be made in 16:9 landscape (1920×1080) and looks designed for it in the
preview, thumbnails and the exported video, with the same templates, starters, media, music and
transitions as the 9:16 story format.

**Done when:** creating a 16:9 project, picking a starter, adding own photos/clips/music and
exporting gives a 1920×1080 MP4 whose frames match the preview; every template has a landscape
layout with no overlapping or clipped text (checked on contact sheets and by the "every template"
test in both formats); the editor UI (preview, strip, focus picker) handles both shapes.
`npm run check`, `npm run test:e2e` and `npm run test:e2e:prod` pass.

**Progress (started 2026-11-25):**

- *Step 1 done:* `render/layout.ts` (`isLandscape`, `unitOf` = the shorter side; equals the width
  in portrait, so portrait sizes are unchanged). Templates pick a portrait or landscape geometry
  object and share the drawing code. Title (text column left, sun right) and Big Number (centred
  stack spread for the shorter frame) have landscape layouts. Guard:
  `render/portraitBaseline.test.ts` hashes every template's draw calls in 9:16 (204 cases); with
  `PORTRAIT_BASELINE=<file>` it records once and then fails on any portrait change. The "every
  template" render test now runs in both formats.
- *Top 5 done:* in 16:9 the title is a column on the left and the ranked list fills the right
  (taller rows, #1 highlighted); empty items are skipped as in portrait.
- *Compare done:* in 16:9 the two values are upright bars side by side on a shared baseline
  (number above, label below, both numbers at the same size), with the % change on the right.

**Where things stood (checked 2026-11-25):**

- *Already format-agnostic:* the project stores `format: { width, height, fps }` (no schema change
  needed for 1920×1080), and `FORMAT_PRESETS.landscape` exists but is `enabled: false`; the New
  project dialog already lists it as "Later". `renderFrame`, transitions, export (worker, encoder,
  bitrate scales by pixel count, which is the same for 1920×1080 and 1080×1920), media decoding,
  music and clip sound all work in pixels of the project format.
- *Portrait-only today:* every template's layout. A 1920×1080 render of all 8 templates with the
  current code shows Big Number's number, unit and caption piled on top of each other, Top 5 rows
  collapsed into overlapping lines, Compare's bars and numbers overlapping, the Title's circle
  swamping the frame; the media templates and Outro are usable but not designed for it.
- *Portrait assumptions elsewhere:*
  - `render/templates/mediaLayout.ts` `STORY_SIZE` (1080×1920) feeds the focus picker's crop shapes
    (`MediaField.focus.aspect.byValue`), so grid/carousel crop outlines would be wrong in 16:9.
  - Editor CSS: the preview canvas is sized by height (`calc(100vh - 300px)`), scene-strip
    thumbnails by a fixed width (54 px) → a 16:9 thumbnail would be ~30 px tall.
  - `lib/capabilities.ts` probes the encoder at 1080×1920 only.
  - Starter stories, defaults and copy mention "story"/9:16 in places.

**Suggested breakdown:**

1. *Aspect-aware layout helpers* (`render/layout.ts`): `isLandscape(frame)`, a "unit" based on
   the shorter side for sizes, and regions (e.g. text column / visual column in landscape vs
   stacked in portrait) so templates pick a layout without duplicating drawing code.
2. *Templates, one at a time*, each with a landscape layout and a contact-sheet check:
   Title, Big Number, Top 5, Compare, Photo / Video, Photo grid (landscape cell arrangements),
   Photo carousel (default direction in landscape), Outro. Portrait output must not change
   (compare portrait frames before/after).
3. *Format-aware geometry for the focus picker:* crop shapes computed for the project's format
   instead of `STORY_SIZE` (descriptor `aspect.byValue` becomes per format, or the inspector asks
   the template's geometry for the current format).
4. *Editor UI:* preview canvas fits either shape; strip thumbnails sized for the shape; the New
   project dialog enables Landscape; a Format switch in the project panel (undoable).
5. *Export & capabilities:* probe 1920×1080 as well; export e2e for a landscape story (frame
   comparison, duration, audio).
6. *Tests:* the "every template" render test and starters test in both formats; template
   specifics (e.g. no text boxes overlapping) where measurable; e2e for creating a landscape
   project and exporting it (also on the production build).

**Decisions (confirmed with the user, 2026-11-25):**

- *Switchable format:* a Format setting in the project panel switches an existing project between
  9:16 and 16:9 (undoable); templates re-lay themselves out for the new shape. Focus points are
  kept (the user may want to re-check them). The New project dialog offers Landscape too.
- *Landscape only:* square (1:1) stays "Later"; the shape-aware layouts make it a smaller job.
- *Designed for wide:* each template gets a real 16:9 layout (e.g. headline on one side and the
  visual on the other, Compare side by side, wide photo-grid arrangements), not the portrait card
  centred on a wide background.
- *Wide media defaults:* in landscape the carousel scrolls sideways by default (vertical still
  selectable) and the grid layouts are 2 side by side, 1 big + 2 stacked, and 2 × 2.
- Portrait (9:16) output must not change.

### 2. Project bundles (deferred from M8 by the user)

Save a project with its media as one file (e.g. `.recap.zip`) to back up or move to another
computer, and import it back.

- Strip EXIF/GPS from photos that were stored byte-for-byte (≤ 2160 px).
- Validate everything on import: Zod for the document (with migrations), unknown templates,
  asset ids, magic bytes for every file, size caps and zip-bomb limits.
- Needs a zip reader/writer: a small dependency, or the browser's `CompressionStream` (deflate)
  plus a minimal zip container written by hand. **Ask before adding a dependency.**

### 3. Postponed ideas from PLAN.md §8

CSV/manual stats import (Spotify-style data without an API), beat detection to sync cuts to music,
keyframes / a multi-track timeline, a template builder, WebGL effects, square (1:1) output,
GIF/WebM/4K/60 fps exports, Firefox/Safari support, mobile layout, desktop packaging (an
installable PWA or a Tauri/Electron app; discussed after M8, not started).

### 4. Known gaps (CLAUDE.md)

Project cards use a static tile instead of a rendered frame; text can look slightly different
between operating systems (system fonts); the preview's clip playback is approximate (the export is
exact); audio tiles have no waveform.

## Open questions for the user

- Which candidate comes next (landscape output is ready to start), or something else?
- If project bundles: backup only (same app, another computer), or also for sharing?
