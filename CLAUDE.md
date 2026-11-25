# CLAUDE.md

Guidance for Claude Code working in this repository. Read this first, then `README.md`.
Deeper context lives in `docs/`:

- `docs/PLAN.md`: the product plan, architecture and milestone roadmap (with status)
- `docs/DECISIONS.md`: why things are the way they are; read before changing a core choice
- `docs/NEXT-M5.md`: handoff and design notes for the next milestone (M5, export)
- `docs/NEXT-M4.md`: the M4 (media) design record, completed

## Project

**Recap Studio** is a local, browser-only video editor for year-in-review stories, inspired by
Spotify Wrapped. A user builds a 9:16 story from templated, animated scenes (big stats, titles,
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
| **M5 Export v1 (video): worker + OffscreenCanvas + Mediabunny** | ⏭ next (see `docs/NEXT-M5.md`) |
| M6 Audio track, mixed into export | planned |
| M7 Template pack + style presets + more transitions | planned |
| M8 Hardening | planned |

Work one milestone at a time. Each ends with something demonstrably working and with tests.

## Commands

```bash
npm run dev          # http://localhost:5173 (bound to localhost only, strictPort)
npm run check        # typecheck + lint + unit tests: run before calling anything done
npm test             # Vitest unit tests only
npm run test:e2e     # Playwright (Chromium); starts the dev server itself
npm run build        # tsc --noEmit && vite build
npm run preview      # production build on :4173 with a strict CSP
npx playwright install chromium   # once per machine
```

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
  editor/       sceneActions.ts (editor commands), selectionStore.ts, useEditorShortcuts.ts
  render/       renderFrame.ts, timeline.ts, easing.ts, text.ts, fields.ts, context.ts,
                media.ts (MediaResolver, cover/contain geometry, drawMedia),
                templates/ (types, registry, title, bigNumber, photo), testing/mockContext.ts
  preview/      playbackStore.ts, usePlaybackClock.ts, PreviewCanvas.tsx, PlaybackControls.tsx,
                usePlaybackShortcuts.ts
  components/   UI pieces (SceneStrip, SceneInspector, FieldEditor, TemplateGallery, SceneThumbnail,
                MediaLibrary, AssetTile, MediaSlotField, Modal, ConfirmDialog, ProjectCard, …)
  export/       encodeStory.ts (frame loop → Mediabunny), export.worker.ts, spike.ts (M5 spike
                harness + inspectExport, used by e2e/export-spike.spec.ts)
  pages/        ProjectsPage, EditorPage, SystemPage, NotFoundPage
  lib/          capabilities, storage, format, debounce, keyboard, ids, errors
e2e/            Playwright specs: projects, preview, editor, media-import, media-library, media-slot,
                media-preview (reads canvas pixels);
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
5. **Template fields are plain descriptors** (`render/fields.ts`: text/number/boolean/choice/media).
   `resolveFields` coerces stored values and never throws; the inspector form is generated from
   the descriptors. A `media` value is a well-formed asset id or `''`; existence and kind are
   checked at draw time. Add new field kinds there.
6. **Scene ops are pure and return the same array for no-ops** (`domain/sceneOps.ts`), so the
   store can skip no-op history entries and untouched scenes keep identity (thumbnails redraw
   only when their own scene changes).
7. **Edits go through `sceneActions`**, which also handle selection and the playhead. Continuous
   input (typing, number fields) passes a `coalesceKey` like `field:<sceneId>:<key>` so it is one
   undo step.
8. **Playback and selection state are UI-only**: separate Zustand stores, never saved, never in
   undo history.
9. **Local-only and safe by default.** No network requests, no third-party scripts or fonts, dev
   server on localhost only, strict CSP in `vite preview`. Never render user content as HTML (an
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
- Definition of done for a milestone: `npm run check` and `npm run test:e2e` pass, the feature is
  exercised in the running app, README/docs updated.

## Known gaps / tech debt

- Project cards on the Projects page use a static `StoryPreviewTile`, not a rendered frame.
- Fonts are system stacks (`Arial Black` for display). Self-hosted font files and
  `document.fonts.load` before export are still to do.
- For the first scene, a `slide` transition renders as a fade from the background.
- Preview video is approximate (`<video>` seeking); frame-exact decoding comes with Mediabunny in
  M5. The exporter must wait for every asset of a frame before drawing it (see `docs/NEXT-M5.md`).
- Export and audio: not started (M5–M6).
- The main JS chunk is ~544 kB (508 kB before M4), over Vite's 500 kB warning. Route-level code
  splitting (e.g. lazy `SystemPage`/editor) would fix it; not urgent for a local app.
- Images up to 2160 px keep their original bytes, including EXIF/GPS; a project-bundle export (M8)
  must strip it.
