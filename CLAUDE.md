# CLAUDE.md

Guidance for Claude Code working in this repository. Read this first, then `README.md`.
Deeper context lives in `docs/`:

- `docs/PLAN.md`: the product plan, architecture and milestone roadmap (with status)
- `docs/DECISIONS.md`: why things are the way they are; read before changing a core choice
- `docs/NEXT-M10.md`: the M10 design record (text carousel, section divider, ducking controls)
- `docs/NEXT-M9.md`: what could come next (M0–M8 complete), with the landscape (16:9) record
- `docs/NEXT-M8.md`: the M8 (hardening) record, completed
- `docs/NEXT-M7.md`: the M7 (templates and style) design record, completed
- `docs/NEXT-M6.md`: the M6 (audio) design record, completed
- `docs/NEXT-M5.md`: the M5 (export) design record and measurements, completed
- `docs/NEXT-M4.md`: the M4 (media) design record, completed

## Project

**Recap Studio** is a local, browser-only video editor for year-in-review stories, inspired by
Spotify Wrapped. A user builds a 9:16 story (or a 16:9 landscape video) from templated, animated scenes (big stats, titles,
later photos/video), previews it live, and (from M5) exports an MP4. Everything stays on the user's
machine: no backend, no accounts, no uploads, no analytics.

It is *inspired by* Wrapped. Never use Spotify's name, logo, colors or typography in the app,
templates or sample content.

### Status

| Milestone | State |
|---|---|
| M0 Scaffold + browser capability check | ✅ done |
| M1 Data model, IndexedDB persistence, projects page, autosave | ✅ done |
| M2 Renderer (`renderFrame`), Title + Big Number templates, live preview | ✅ done |
| M3 Editor: inspector, scene reorder/duplicate/delete, undo/redo | ✅ done |
| M4 Media import (OPFS), media library, Photo/Video template | ✅ done |
| M5 Export v1 (video): worker + OffscreenCanvas + Mediabunny | ✅ done |
| M6 Audio track, mixed into export | ✅ done |
| M7 Template pack + style presets + more transitions | ✅ done |
| M8 Hardening | ✅ done |
| Landscape (16:9) output (first M9 candidate) | ✅ done |
| Desktop app (Tauri, Windows) | ✅ done |
| 60 fps export (Export dialog option, D35) | ✅ done |
| M10 Text carousel, section divider, ducking controls | 🚧 in progress |

The original roadmap is complete, and so are landscape output, the desktop app and 60 fps export
(records in `docs/NEXT-M9.md`, which also lists the remaining candidates).

Work one milestone at a time. Each ends with something demonstrably working and with tests.

## Commands

```bash
npm run dev          # http://localhost:5173 (bound to localhost only, strictPort)
npm run check        # typecheck + lint + unit tests: run before calling anything done
npm test             # Vitest unit tests only
npm run test:e2e     # Playwright (Chromium); starts the dev server itself
npm run test:e2e:prod # builds, then runs the e2e flows against `vite preview` (strict CSP, headers)
npm run build        # tsc --noEmit && vite build
npm run preview      # production build on :4173 with a strict CSP
npm run desktop:dev  # desktop app (Tauri) window on the dev server; needs Rust (rustup, stable-msvc)
npm run desktop:build # Windows NSIS setup.exe in src-tauri/target/release/bundle/nsis/
npm run test:desktop # smoke test of the built desktop .exe (run desktop:build first)
npx playwright install chromium   # once per machine
```

Playwright reuses a dev server already listening on :5173 (`reuseExistingServer`). If e2e results
look inexplicable (code that passed earlier now fails), check for an orphaned `vite` process from
an interrupted run and stop it, or run against a fresh server on another port.

## Environment

- Developer machine: **Windows**, PowerShell, Node **26** (minimum is 22.12 because of Vitest 5),
  npm **11**.
- npm 11 blocks install scripts unless approved; `package.json` has an `allowScripts` entry for
  esbuild. If a new dependency needs an install script:
  `npm install-scripts approve <pkg>` then `npm rebuild <pkg>`.
- Never run `npm audit fix --force`. Read `npm audit` and bump the specific package instead.
- Desktop Chrome/Edge is the target browser (WebCodecs). The System page (`/system`) shows what the
  current browser supports; on the developer's machine export target is **MP4 (H.264 + AAC)**.

## Stack

Vite 7 · React 19 · TypeScript 5 (strict) · React Router 7 · Zustand 5 · Zod 4 · Dexie 4
(+ dexie-react-hooks) · Mediabunny 1.65 (WebCodecs encoding/muxing, export) · Vitest 5 +
fake-indexeddb · Playwright · ESLint 10 + typescript-eslint + eslint-plugin-react-hooks 7.

Prefer **no new dependencies**. If one is genuinely needed, say why and ask first.

## Architecture map

```
src/
  domain/       Pure model. project.ts (Zod schemas, CURRENT_SCHEMA_VERSION, createProject),
                asset.ts (AssetSchema, supported MIME types, MEDIA_LIMITS, remapAssetIds),
                music.ts (music timing + fade/gain rules shared by preview and export),
                migrations.ts, sceneOps.ts (pure scene-list operations), stylePresets.ts
  db/           database.ts (Dexie schema, v2), projectRepository.ts, assetRepository.ts,
                opfsStore.ts (streaming OPFS file store), index.ts (app singletons),
                testing/memoryDirectory.ts (in-memory OPFS fake for unit tests)
  media/        sniff.ts (magic-byte detection), importAsset.ts (createImporter: limits, probe,
                quota, persistence), browserProbe.ts (decode/downscale/thumbnails, <video> metadata),
                assetStatus.ts (thumbnail URL / missing-file store for tiles),
                dragData.ts (library-tile drag payload), mediaCache.ts (decoded images +
                <video> pool for the preview, thumbnail resolver for the strip),
                index.ts (importer, assetStatus, mediaCache singletons)
  store/        createEditorStore.ts: loaded project, debounced serialized autosave, undo/redo
  editor/       sceneActions.ts (editor commands), musicActions.ts (music track), selectionStore.ts,
                useEditorShortcuts.ts
  render/       renderFrame.ts, timeline.ts, easing.ts, text.ts, fields.ts (+ slotCropAspect), context.ts,
                layout.ts (isLandscape, unitOf), portraitBaseline.test.ts (9:16 output guard),
                media.ts (MediaResolver, cover/contain geometry, drawMedia), clipSound.ts (when clips are heard),
                templates/ (types, registry, title, bigNumber, topList, compare, photo, photoGrid,
                carousel, outro, mediaLayout, starters), testing/mockContext.ts
  preview/      playbackStore.ts, usePlaybackClock.ts, PreviewCanvas.tsx, PlaybackControls.tsx,
                usePlaybackShortcuts.ts, PreviewMusic.tsx + musicSync.ts (music follows the playhead)
  components/   UI pieces (SceneStrip, SceneInspector, FieldEditor, TemplateGallery, SceneThumbnail,
                MediaLibrary, AssetTile, MediaSlotField, FocusPicker, ExportControl, ExportDialog,
                MusicSection, FormatPicker,
                Modal, ConfirmDialog, ProjectCard, …)
  export/       exportStory.ts (main-thread API: snapshot, target, assets, worker), export.worker.ts,
                encodeStory.ts (plan pass + frame loop → Mediabunny, interleaved music),
                audioSources.ts + audioMix.ts (decode, resample, mix music + clip sound), exportMedia.ts (frame-exact
                media: record → plan → prepare → free), videoReader.ts, presets.ts (quality presets,
                EXPORT_FPS 30/60), target.ts, codecString.ts (codec level for size + frame rate),
                testing/inspectExport.ts (decode + compare, e2e only), exportStore.ts (UI-only
                export state), mediaRefs.ts, index.ts (useExportStore; exporter lazy-loaded)
  storage/      mediaUsage.ts (what media takes space; delete one / all unused, via repositories)
  pages/        ProjectsPage, EditorPage, StoragePage, SystemPage, NotFoundPage
  lib/          capabilities, storage, format, debounce, keyboard, ids, errors
e2e/            Playwright specs: projects, preview, editor, media-import, media-library, media-slot,
                media-preview (reads canvas pixels), media-project, export (decodes the output), export-ui,
                music, starters, export-60fps; helpers/story.ts adds the basic 8.5 s story for timing tests;
                helpers/media.ts generates test images/video in the page (no binary fixtures)
```

Data flow: UI → `editor/sceneActions` → `useEditorStore.update(recipe, { coalesceKey })` →
immutable new `Project` → autosave → `projectRepository.save` (validates) → IndexedDB.
Preview: `PreviewCanvas` subscribes to the editor and playback stores (and `mediaCache`) and calls
`renderFrame(ctx, project, timeMs, mediaCache.preview)` at most once per animation frame, outside
React rendering.

## Invariants: do not break these

1. **The project document is the single source of truth.** One JSON object per project. The
   renderer and (later) the exporter read the same object. Media binaries are referenced by id,
   never embedded.
2. **Schema changes need a migration.** Bump `CURRENT_SCHEMA_VERSION`, add a migration keyed by
   the version it migrates *from* in `domain/migrations.ts`, and add a test with a real old fixture.
   Every read goes through `migrateProject`; every write is validated by the repository.
3. **Only the repositories touch storage.** `db/projectRepository.ts` owns the `projects` table;
   `db/assetRepository.ts` owns the `assets` table and OPFS (via `db/opfsStore.ts`).
4. **`renderFrame` and templates are pure and deterministic.** Output depends only on
   (project, time, media). Media comes in through a synchronous `MediaResolver`
   (`render/media.ts`, `frame.media`); templates draw a placeholder when it answers `undefined`
   and never load anything themselves. In templates:
   - animate with `progress()` + easing on `frame.localMs`; never `Math.random()` (use
     `seededRandom`), `Date.now()`, or state kept between calls
   - use `withAlpha()` / `isolated()`; never assign `ctx.globalAlpha` directly
   - format numbers with a fixed locale (`en-US`)
   - set `posterMs` (when the scene looks complete); it drives selection and thumbnails
   - `renderFrame` respects the caller's transform (thumbnails draw on a scaled context)
   - work in both shapes (9:16 and 16:9): size text/strokes from `unitOf(frame)` (the shorter
     side), pick positions with `isLandscape(frame)`. Portrait output must not change: record
     `PORTRAIT_BASELINE=<file> npx vitest run src/render/portraitBaseline.test.ts` before and
     compare after a template change
5. **Template fields are plain descriptors** (`render/fields.ts`: text/number/boolean/choice/media,
   each with an optional plain-data `visibleWhen` for the inspector).
   `resolveFields` coerces stored values and never throws; the inspector form is generated from
   the descriptors. A `media` value is a well-formed asset id or `''`; existence and kind are
   checked at draw time. Add new field kinds there.
6. **Scene ops are pure and return the same array for no-ops** (`domain/sceneOps.ts`), so the
   store can skip no-op history entries and untouched scenes keep identity (thumbnails redraw
   only when their own scene changes).
7. **Edits go through `sceneActions`**, which also handle selection and the playhead. Continuous
   input (typing, number fields) passes a `coalesceKey` like `field:<sceneId>:<key>` so it is one
   undo step.
8. **Playback, selection and export state are UI-only**: separate Zustand stores, never saved,
   never in undo history.
9. **Local-only and safe by default.** No network requests, no third-party scripts or fonts, dev
   server on localhost only, strict CSP in `vite preview` (Trusted Types enforced: the only allowed
   policy is `recap-export-worker` for the export worker URL; create Workers through
   `export/workerUrl.ts`-style policies, never from arbitrary strings). Never render user content as HTML (an
   ESLint rule bans `dangerouslySetInnerHTML`). Treat imported files and stored data as untrusted.

## Code conventions

- TypeScript strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`: use `import type`
  for types, and handle `undefined` from indexing.
- eslint-plugin-react-hooks v7 is strict: **don't set React state inside effects.** Use the
  patterns already in the code: remount via a child component (`NewProjectForm`), or a
  "draft only while editing" state (`ProjectNameField`, `NumberInput`).
- Factories for testability: `createEditorStore(repo, { now })`, `createProjectRepository(db, { now })`.
  Singletons live in `db/index.ts` and `store/editorStore.ts`.
- Accessible by default: real buttons and labels, `aria-*` where needed, keyboard paths for every
  pointer action (e.g. reorder via Alt+←/→ as well as drag). E2E tests select by role and label.
- Styling: plain CSS in `src/styles.css` with CSS variables; no CSS framework.
- Keep `README.md` current when adding features, shortcuts or conventions.

## Testing

- Unit tests: `src/**/*.test.ts`, Node environment, `fake-indexeddb/auto` as setup file.
  Canvas code is tested with `render/testing/mockContext.ts` (records draw calls).
- `render.test.ts` renders **every registered template** at many timestamps in every palette, so
  new templates get basic coverage automatically; add template-specific tests too.
- E2E: `e2e/*.spec.ts`, Chromium. Each test gets a fresh browser context (empty IndexedDB).
  Tests that import app modules via `/src/...` (dev server only) are tagged `@dev`; tests of the
  production server (headers) are tagged `@prod`. `npm run test:e2e:prod` runs everything not
  tagged `@dev` against the production build.
- Definition of done for a milestone: `npm run check` and `npm run test:e2e` pass, the feature is
  exercised in the running app, README/docs updated.

## Known gaps / tech debt

- Project cards on the Projects page use a static `StoryPreviewTile`, not a rendered frame.
- Fonts are system stacks (`Arial Black` for display); preview and export worker render them (and
  emoji/CJK fallbacks) identically on the same machine, but output can differ *between* machines.
  Self-hosted fonts (M7) must be loaded in the page and in the worker with explicit
  `FontFace.load()`; `self.fonts.ready` never resolves in a worker.
- Preview video is approximate (`<video>` seeking); export decodes clips frame-exactly, so a clip
  can look a frame off in the preview but never in the file.
- Export speed is dominated by the video encoder (≈97 % of the time; drawing and media decoding are
  negligible, see `ExportedFile.timings`). In real Edge/Chrome with hardware encoding a 30 s story
  with photos and clips exports in ~5 s (190 fps); Playwright's bundled Chromium encodes in
  software and is ~3.7× slower, so don't read e2e export timings as user-facing speed.
- Preview music is an `<audio>` element re-synced past 0.2 s drift; the export mix is exact.
- Audio assets have no waveform thumbnail (the tile shows ♪ and the duration).
- Bundles: app entry ~32 kB, editor ~80 kB (lazy), framework `vendor` chunk ~513 kB / 161 kB gzip
  (react-dom, Dexie, Zod, React Router; only replacing those would shrink it), export worker
  ~712 kB (loaded on first export). Warning limit set to 600 kB with that rationale. Route-level code
  splitting (e.g. lazy `SystemPage`/editor) would fix it; not urgent for a local app.
- Images up to 2160 px keep their original bytes, including EXIF/GPS; a project-bundle export (M8)
  must strip it.
