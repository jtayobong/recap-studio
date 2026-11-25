# Recap Studio: product and implementation plan

The original plan for the project, kept up to date with milestone status.
For the reasoning behind individual choices see `DECISIONS.md`.

## 1. Concept

A **scene-based story editor, not a general non-linear editor.** The user picks scene templates
("Big Number", "Title", later "Top 5", "Photo + Caption"…), fills in their fields, sets durations,
orders scenes, adds one music track, and exports a 9:16 MP4.

This is the most important scoping decision. A free-form multi-track timeline is what turns a
six-week project into a six-month one. Templates are the unit of new features.

## 2. Technology

| Layer | Choice | Why |
|---|---|---|
| App shell | Vite + React + TypeScript | Fast local dev server, no backend, strong typing for the document model |
| State | Zustand (custom snapshot undo/redo) | Small; the canvas can subscribe without React re-renders |
| Validation | Zod (project document) + plain field descriptors (template fields) | One source of truth for stored data; descriptors also generate the inspector |
| Rendering | Canvas 2D with one pure `renderFrame(project, t)` | Preview and export run the same code, so preview matches export |
| Export (M5) | Mediabunny (WebCodecs) in a Web Worker | Hardware-accelerated, no server, UI stays responsive |
| Audio (M6) | `<audio>` in the preview; Mediabunny decode/encode for export (`OfflineAudioContext` isn't available in workers) | Same pipeline as video export; see `docs/NEXT-M6.md` |
| Storage | IndexedDB via Dexie (documents) + OPFS (media binaries, M4) | Structured data in a DB; large binaries in a streamable file system |
| Testing | Vitest (model, renderer, stores) + Playwright (flows) | Renderer is pure, so it can be unit-tested with a mock context |

Rejected or deferred: Remotion (great, but needs a Chromium render process and has company
licensing), ffmpeg.wasm (large/slow, possible fallback only), Electron/Tauri (not needed until
native file access is), any backend.

## 3. Pages

1. **Projects** (`/`): list, create (name, format, palette), rename, duplicate, delete.
2. **New project dialog**: format (9:16 now; 1:1 and 16:9 "later"), palette.
3. **Editor** (`/project/:id`): left = template gallery (+ media in M4); centre = preview canvas +
   playback controls; right = inspector (scene or project settings); bottom = scene strip.
4. **Export** (M5): modal with settings, progress, cancel, download.
5. **System** (`/system`): browser capability report, export target, storage usage, persistence.

## 4. User journey

Open app (capability check) → create project → "Add starter scenes" → select a scene, edit its
text/number/duration/transition in the inspector, with live preview → (M4) add photos/clips →
(M6) add music → preview the whole story → (M5) export MP4 → download. Autosave throughout;
reopening restores everything.

## 5. Data handling

- **All local.** Project JSON in IndexedDB; media in OPFS (M4); scenes reference media by asset id.
- **Autosave** debounced 500 ms, serialized; flushed on leaving the editor, tab hide and unload.
- **Schema versioning** with step-by-step migrations; invalid or newer-version rows are listed as
  "can't open" rather than breaking the page.
- **Persistent storage** can be requested from the System page (browsers may evict otherwise).
- **Preview vs export pipelines** (M4/M5): preview uses `<video>` elements for clips (fast,
  approximately frame-exact); export decodes exact frames with Mediabunny in a worker.

## 6. Milestones

| # | Milestone | Done when | Status |
|---|---|---|---|
| M0 | Scaffold, lint, tests, capability check | App runs and reports WebCodecs/OPFS support | ✅ |
| M1 | Data model + persistence: schemas, migrations, Dexie, projects CRUD, autosave | Projects survive reload | ✅ |
| M2 | Renderer core, Title + Big Number templates, preview with play/pause/scrub | A starter story plays smoothly | ✅ |
| M3 | Editor UI: strip reorder/duplicate/delete, inspector from field descriptors, durations, transitions, undo/redo | A story can be built entirely through the UI | ✅ |
| M4 | Media: import to OPFS, thumbnails, media library, Photo/Video template with fit/crop | Photos and clips appear in scenes and preview | ✅ |
| M5 | Export v1 (video): worker, OffscreenCanvas, Mediabunny MP4, progress, cancel, download | A 30 s 1080×1920 MP4 matches the preview frame for frame | ✅ |
| M6 | Audio: one music track, offset/volume, synced preview, mixed into export | Exported MP4 has correctly timed audio | ✅ |
| M7 | Template pack + style: Top 5, Compare, Outro, palettes/font pairs, more transitions, starter stories | The starter story looks great out of the box | ✅ |
| M8 | Hardening: errors, missing files, quota warnings, input limits, migration tests, project bundle import/export, e2e happy path, CSP review | A fresh user can go from start to export with no dead ends | ✅ |
| M9 cand. 1 | Landscape (16:9) output: shape-aware template layouts, format switch, focus picker, export (`docs/NEXT-M9.md`) | A 16:9 project looks designed for it in preview and a 1920×1080 export | ✅ |

M5 is the riskiest milestone. The spike (canvas animation → MP4 in a worker) wasn't done during M4;
it is the first step of M5 (`docs/NEXT-M5.md`).

All milestones of this plan are done (2026-11-25). What could come next: `docs/NEXT-M9.md`.

## 7. Security and privacy

- Dev server bound to `localhost` (never `--host` on shared networks).
- Untrusted files (M4): check type by magic bytes, not extension; enforce size/duration limits; let
  the browser sandbox decode; never `eval` or HTML-inject file content.
- Project import (M8): validate the whole document with Zod, reject unknown templates gracefully,
  cap archive sizes (zip bombs).
- No user content rendered as HTML (lint-enforced). Canvas text is inherently safe.
- Strict CSP on the production preview server (`vite.config.ts`).
- Photos carry EXIF/GPS: exported video won't, but a future project bundle would, so strip it or
  warn the user.
- Listening stats are personal data: keep them out of logs.
- Supply chain: minimal deps, committed lockfile, `npm audit` (no `--force`).
- Resource exhaustion: limit and downscale large inputs; fail gracefully.
- If a Spotify API import is ever added: OAuth PKCE, minimal scopes, no client secret in the
  frontend, check the developer terms on displaying and reusing data.
- Exports may contain copyrighted music: show a short notice that the user is responsible.

## 8. Postponed until the basics work

Spotify API import (CSV/manual entry first) · beat detection / auto-sync · multi-track timeline,
keyframes · user-defined template builder or marketplace · advanced transitions, particles,
WebGL/WebGPU · multiple aspect ratios at once · GIF/WebM/ProRes/60 fps/4K exports · project bundle
sharing · Firefox/Safari parity, mobile layout · Tauri/Electron packaging · cloud sync,
collaboration · AI features.
