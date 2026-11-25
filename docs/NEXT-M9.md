# Next: after the original roadmap (M0–M8 done)

The plan in `PLAN.md` is complete: a fresh user can go from a starter story, through their own
numbers, photos, clips and music, to a downloaded MP4, with tested failure paths along the way.
This note collects candidates for what comes next. Landscape output (candidate 1) is **done**
(2026-11-25) and kept here as its record; the other candidates are still undecided.

## Candidates

### 1. Landscape (16:9) output: ✅ done (2026-11-25; was "M8.1")

**Done-when result:** a 16:9 project created in the New project dialog (or switched in the project
panel), from a starter with own photo and song, exports through the UI as a 1920×1080 MP4 that
plays for the story's length with its music (`e2e/landscape.spec.ts`, also on the production
build); a 16:9 story with all 8 templates, a photo, a clip and music exports with every scene's
frame matching the renderer (`e2e/landscape-export.spec.ts`). Every template has a landscape
layout, checked on contact sheets and by text-bounds tests for every template and every starter
scene in 16:9; 9:16 output is unchanged (portrait baseline, 204 cases). `npm run check` (385 unit
tests), `npm run test:e2e` (59) and `npm run test:e2e:prod` (41) pass.

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
- *Photo / Video done:* the media stays full-bleed (cover/contain, focus and Ken Burns work in any
  frame shape); in 16:9 the caption is a lower third over the left ~60 % (2 lines) and the
  empty-slot placeholder is a wide box.
- *Photo grid done:* `gridCells` lays out per shape: in 16:9, 2 side by side, 1 big (left, 60 %)
  + 2 stacked on the right, and 2 × 2; margins/gaps from the shorter side. The layout option
  "2 photos (stacked)" is now just "2 photos". Still to do (step 3): the focus picker's crop shapes
  for grid cells are computed for 9:16 only.
- *Photo carousel done:* sideways stays the default in both shapes. In 16:9 the sideways cards
  are ~1.45:1 (the next card peeks in), upward cards are wide and slide under the title band;
  cards sit lower to leave the title room. Crop shapes in the focus picker: step 3, as for the grid.
- *Outro done (step 2 complete):* in 16:9 the rings and title sit on the left and the message is
  a column on the right, clear of the rings. All 8 templates now have a landscape layout; the
  text-bounds test covers every template in 16:9 and portrait output is unchanged.
- *Step 3 done (focus picker):* `MediaField.focus.aspect` is now `{ field, byShape: { portrait,
  landscape } }` (still plain data), computed from `REFERENCE_SIZES` in `mediaLayout.ts` (replaces
  `STORY_SIZE`). `slotCropAspect(focus, values, format)` in `render/fields.ts` picks the crop shape
  for the project's format (slot shape, else the whole frame); the inspector uses it.
- *Step 4 done (editor):* Landscape is enabled (`FORMAT_PRESETS.landscape.enabled`); the New
  project dialog and a **Format** picker in the project panel share `FormatPicker`; switching is
  one undo step (`withFormatPreset`, `formatPresetOf` in `domain/project.ts`). The preview canvas
  in 16:9 is limited by the stage width and height; strip thumbnails are 96 × 54 (canvas 192 px).
  Found and fixed: the editor's outer grid had an implicit `auto` column, so a long scene strip
  widened the whole page (pushing the inspector and Export off-screen) instead of scrolling; this
  also affected long 9:16 stories. `e2e/landscape.spec.ts` covers create → preview → thumbnails →
  switch → undo → reload.
- *Step 5 done (export):* the capability probe requires the video encoder at 1080×1920 *and*
  1920×1080. `e2e/landscape-export.spec.ts` (@dev) exports a 16:9 story with all 8 templates, a
  photo, a clip and music: 1920×1080, 27 s, every scene's frame matches the renderer (mean |Δ|
  ≤ 1.2), music included. `e2e/landscape.spec.ts` exports a 16:9 starter with own photo and song
  through the UI (also on the production build) and plays it: 1920×1080, 34 s, AAC track.
- *Step 6 done (tests and wrap-up):* the starters test renders all three starters in both formats
  and checks every starter scene's text stays inside a 16:9 frame; a contact sheet of all 21
  starter scenes in 16:9 showed no overlaps. Decision record: D33 in `DECISIONS.md`.

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

### 1b. Desktop app (Tauri, Windows), started 2026-11-25

The user chose Tauri from four options (PWA, Tauri, Electron, a small launcher), with an NSIS
setup.exe (per-user, no admin). Rust was installed with `winget install Rustlang.Rustup` (stable
MSVC; Visual Studio Build Tools and WebView2 were already present).

- `src-tauri/`: a thin shell, one window showing the bundled `dist/` in WebView2 (Edge's engine,
  so WebCodecs and OPFS behave as in desktop Edge). No plugins, no IPC, no permissions
  (`withGlobalTauri: false`, empty capability), so the page can't reach native APIs.
- Origin `https://tauri.localhost` (`useHttpsScheme: true`): a fixed secure origin. **Don't change
  it later**: storage is per origin, so a different origin would hide every saved project.
  Projects made in the browser (`localhost:5173`/`:4173`) don't appear in the app, and vice
  versa, until project bundles exist.
- Security: the same CSP and Permissions-Policy as `vite preview`, from one source
  (`src/security/policy.ts`); `policy.test.ts` fails if `tauri.conf.json` drifts.
- `npm run desktop:dev` (window on the Vite dev server), `npm run desktop:build` (setup.exe in
  `src-tauri/target/release/bundle/nsis/`), `npm run test:desktop` (smoke test of the built .exe
  over CDP with a throwaway WebView2 data folder: origin, Trusted Types, capability check, 16:9
  export and download, projects kept across restarts).
- App data lives in `%LOCALAPPDATA%\local.recapstudio.desktop\EBWebView` (WebView2 user data).
- Not done: code signing (Windows SmartScreen will warn on an unsigned setup.exe), auto-update,
  macOS/Linux builds (their system WebViews lack reliable WebCodecs H.264 encoding).
- Result (2026-11-25): `npm run desktop:build` gives a 3.4 MB `recap-studio.exe` and a 1.4 MB
  setup.exe; `npm run test:desktop` passes (origin, Trusted Types active, MP4 export available,
  16:9 starter exported and downloaded, project still there after restarting the app).
  Decision record: D34.

### 1c. 60 fps export (added 2026-11-25; chosen as next, not started)

**Goal:** the Export dialog offers 60 fps as well as 30 fps, for smoother motion (count-ups,
carousels, transitions, Ken Burns zooms), in both 9:16 and 16:9.

**Done when:** a story exported at 60 fps has twice the frames (e.g. 8.5 s → 510), plays for the
same length with the music in sync, and its frames match the renderer at 60 fps timestamps
(including mid-transition); 30 fps stays the default and unchanged; the capability check and the
dialog only offer 60 fps where the browser can encode it. `npm run check`, `npm run test:e2e` and
`npm run test:e2e:prod` pass.

**Where things stand (checked 2026-11-25):**

- *Mostly ready:* the schema already allows `format.fps` of 24, 25, 30 or 60 (no migration
  needed); the renderer is time-based (`renderFrame(…, timeMs)`), so it draws any frame rate; the
  export loop works in frames of `project.format.fps` (`frameCount`, `frameToMs`, `source.add(frame
  / fps, 1 / fps)`); `bitrateFor` already scales with √(fps / 30) (Standard at 60 fps ≈ 11.3 Mbps);
  audio is independent of the frame rate; the preview runs on `requestAnimationFrame`, so it is
  already as smooth as the screen.
- *Needs work:*
  - H.264 level: the capability probe uses `avc1.640028` (level 4.0), which allows 1080p only up
    to ~30 fps; 1080×1920 / 1920×1080 at 60 fps needs level 4.2 (`avc1.64002A`). Check which codec
    string Mediabunny chooses when encoding at 60 fps, and probe 60 fps separately (a browser may
    encode 30 but not 60).
  - Where the choice lives: an **export option** (Export dialog: 30 / 60 fps, the project stays at
    30) or a **project setting** (`format.fps`, also used for frame stepping in the preview).
  - Video clips are usually 30 fps (or 24/25): at 60 fps their frames repeat (correct, but no
    smoother). The frame-exact clip decoding (`exportMedia.ts`) already asks for each output
    frame's time, so it should just work; needs a test with a 30 fps clip.
  - Export takes about twice as long (encoder-bound: ~10 s instead of ~5 s for a 30 s story with
    hardware encoding; ~2× longer in Playwright's software encoder), and files are ~40 % larger.
  - Size estimate and the dialog's "… · 30 fps · …" line follow the choice.
- *Tests:* unit (frame counts, bitrate, probe with level 4.2), e2e export at 60 fps (frame
  comparison at frame-aligned 60 fps times, duration, packet count, audio sync), the WebM/VP9
  fallback at 60 fps, the desktop smoke test unchanged.

**Decisions (confirmed with the user, 2026-11-25):**

- **Export option:** 30 / 60 fps is chosen in the Export dialog per export; the project stays at
  30 fps (`format.fps` unchanged, nothing to migrate or undo).
- **All three presets** at 60 fps, bitrates scaled by √2 (Standard ~11.3, High ~17, Smaller ~7
  Mbps for 1080×1920 / 1920×1080).
- **30 fps stays the default.**

### 2. Project bundles (deferred from M8 by the user)

Save a project with its media as one file (e.g. `.recap.zip`) to back up or move to another
computer, and import it back.

- Purpose (user decision): backup and moving your own projects, not sharing.
- Strip EXIF/GPS from photos that were stored byte-for-byte (≤ 2160 px).
- Validate everything on import: Zod for the document (with migrations), unknown templates,
  asset ids, magic bytes for every file, size caps and zip-bomb limits.
- Needs a zip reader/writer: a small dependency, or the browser's `CompressionStream` (deflate)
  plus a minimal zip container written by hand. **Ask before adding a dependency.**

### 3. Postponed ideas from PLAN.md §8

CSV/manual stats import (Spotify-style data without an API), beat detection to sync cuts to music,
keyframes / a multi-track timeline, a template builder, WebGL effects, square (1:1) output,
GIF/WebM/4K exports, Firefox/Safari support, mobile layout. (Desktop packaging: see 1b; 60 fps
export: see 1c.)

### 4. Known gaps (CLAUDE.md)

Project cards use a static tile instead of a rendered frame; text can look slightly different
between operating systems (system fonts); the preview's clip playback is approximate (the export is
exact); audio tiles have no waveform.

## Decisions on what's next (user, 2026-11-25)

- **Next: 60 fps export** (1c).
- **Project bundles**, when built, are for **backup and moving** your own projects (between the
  browser, the desktop app and computers), not for sharing; imports are still fully validated.
