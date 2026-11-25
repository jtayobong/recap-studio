# Recap Studio

A local, Wrapped-inspired story video editor. Everything runs in your browser: projects and media
stay on your computer, and nothing is uploaded.

**Status:** M0 (scaffold + capability check), M1 (data model, persistence, autosave),
M2 (renderer, first templates, live preview) and M3 (scene editing, undo/redo) are done.

## Getting started

Requires Node 22.12+ and a recent desktop Chrome or Edge.

```bash
npm install
npx playwright install chromium   # once, for end-to-end tests
npm run dev                       # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server, bound to `localhost` only |
| `npm run check` | Typecheck + lint + unit tests |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright, starts the dev server) |
| `npm run build && npm run preview` | Production build served with a strict CSP |

## Project structure

```
src/
  domain/        Pure model: Zod schemas, project factory, style presets, migrations
  db/            Dexie database + project repository (the only code that touches IndexedDB)
  store/         Zustand editor store: autosave (debounced, serialized) and undo/redo history
  editor/        Editor commands (add/move/duplicate/delete/edit scenes), selection, shortcuts
  render/        Pure renderer: renderFrame(), timeline, easing, text fitting, scene templates
  preview/       Live preview: canvas, playback store/clock, controls, keyboard shortcuts
  lib/           Capability detection, storage info, formatting, debounce
  components/    Reusable UI: Modal, ConfirmDialog, ProjectCard, PalettePicker, CapabilityGate, …
  pages/         Projects, Editor (shell), System, NotFound
e2e/             Playwright specs
```

## Key decisions in M0/M1

- **The project document is the single source of truth.** One JSON object per project (`domain/project.ts`),
  validated with Zod. The renderer (M2) and exporter (M5) will read the same object.
- **Every read migrates, every write validates.** Stored rows are treated as untrusted. `migrateProject`
  upgrades old versions step by step; the repository refuses to save invalid data. Unreadable projects
  are listed separately instead of crashing the page.
- **Persistence is behind a repository.** UI and store code never call Dexie directly, so validation
  can't be skipped and storage can change later.
- **Autosave is debounced (500 ms) and serialized.** Saves go through a promise chain, so they never
  race. The status only shows "saved" if nothing changed during the write. Pending changes are flushed
  when you leave the editor, hide the tab or close it.
- **The capability check blocks only what it must.** Missing storage features block the app. Missing
  encoders only disable export (with a banner), so editing still works in other browsers.
- **Local-only by default.** The dev server binds to `localhost`, the production preview sends a strict
  CSP, and there are no third-party scripts, fonts or analytics.

## Changing the project schema

1. Bump `CURRENT_SCHEMA_VERSION` in `src/domain/project.ts`.
2. Add a migration in `src/domain/migrations.ts`, keyed by the version it upgrades **from**.
3. Add a test with a real old-version fixture in `migrations.test.ts`.

## How rendering works (M2)

- `renderFrame(ctx, project, timeMs)` draws one complete frame. It is pure: the output depends only
  on the project and the time. The preview calls it on every animation frame; export (M5) will call
  it once per output frame, so what you see is what you export.
- The preview canvas has the full output resolution (1080×1920) and is scaled down with CSS.
  Drawing happens outside React, driven by store subscriptions.
- Scenes play end to end. A scene's entrance transition (`fade`, `slide`, `cut`) overlaps its own
  first 450 ms, drawing the previous scene's final frame underneath.
- A broken or unknown template draws a message card instead of crashing the preview.

## Editing (M3)

- **Scenes:** add from the left panel (inserted after the selected scene), click a scene in the strip
  to edit it. Reorder by dragging, with **Alt+←/→**, or with the inspector's move buttons.
  **Delete** removes the focused scene.
- **Inspector:** generated from the template's field descriptors, plus duration and transition.
  Selecting a scene moves the playhead to its *poster frame* (the moment it looks complete).
- **Undo/redo:** whole-project snapshots (up to 100). Edits to the same field less than a second
  apart are grouped, so typing a word is one undo step.
- Scene edits live in `src/domain/sceneOps.ts` (pure functions) and `src/editor/sceneActions.ts`
  (commands that also handle selection and the playhead).

| Shortcut | Action |
|---|---|
| Space | Play / pause |
| ← / → (Shift: 1 s) | Step one frame |
| Home / End | Start / end |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y | Undo / redo (outside text fields) |
| Alt+← / Alt+→ | Move the focused scene |
| Delete | Delete the focused scene |
| Esc | Back to project settings |

## Adding a scene template

1. Create `src/render/templates/<name>.ts` with `defineTemplate({ id, name, fields, render, … })`.
   - `fields` are plain descriptors (`text`, `number`, `boolean`, `choice`). Stored values are
     validated against them before rendering, and M3 will build the inspector form from them.
   - `render` must be pure: animate with `progress()` + easing on `frame.localMs`, never
     `Math.random()` (use `seededRandom`) or `Date.now()`, and use `withAlpha()` rather than
     assigning `ctx.globalAlpha`.
   - Set `posterMs` to the scene-local time at which everything has animated in.
2. Register it in `TEMPLATES` in `src/render/templates/registry.ts`.
3. The test "draws every template at many points in time" covers it automatically.

## Next: M4 (media)

Import photos and clips into local storage (OPFS) with thumbnails, a media library, and a
Photo/Video template with fit and crop.
