# Next up: M5, export v1 (video)

**Goal:** render the story to an MP4 (H.264; WebM/VP9 fallback where H.264 encoding isn't available)
in a worker, with progress, cancel and a download, matching the preview frame for frame.

**Done when:** a 30 s 1080×1920 story with title, big-number and photo/video scenes exports to a
playable file whose frames match the preview at the same timestamps. `npm run check` and
`npm run test:e2e` pass.

These are notes, not final decisions. Confirm anything marked **open** with the user before building.

## What M4 leaves in place for export

- `renderFrame(ctx, project, timeMs, media)` is synchronous. Templates get media only through the
  `MediaResolver` (`render/media.ts`) and draw a placeholder when it answers `undefined`.
  **The exporter must never draw a frame with media still missing.** For each frame, collect the
  asset ids it needs, wait until every one is decoded, then call `renderFrame`. Templates don't
  report what they need yet, so either add `assetsAt(project, timeMs)` (every `media` field of the
  active and outgoing scene) or do a dry run with a recording resolver.
- Video in the preview is approximate (`<video>` seeking). Export needs exact frames: decode with
  Mediabunny (`VideoSampleSink` / `CanvasSink`), with the same clip-time rule as the preview:
  `clipMs = scene localMs`, clamped to the clip length (the last frame holds).
- Images: `createImageBitmap(file)` works in a worker. Assets are read through `assetRepository`.
  Dexie and OPFS (`navigator.storage.getDirectory()`) both work inside dedicated workers.
- `coverRect` / `containRect` / `drawMedia` / `kenBurnsZoom` are pure and shared, so preview and
  export crop identically.
- The Projects page sweep (`sweepOrphanedMediaOnce`) and project delete must not run while an export
  reads files. Today only one tab edits at a time, and the sweep skips files younger than an hour.

## Suggested breakdown

1. **Spike first** (the riskiest piece; it wasn't done during M4): worker + OffscreenCanvas →
   Mediabunny → MP4 for a 5 s starter story. Measure speed at 1080×1920@30.
2. Export module (`src/export/`): worker entry, message protocol (start, progress, cancel, done,
   error), frame loop with `assetsAt` preloading, encoder config from the capability probe
   (`lib/capabilities.ts` already picks MP4 or WebM).
3. Fonts: `document.fonts.load` (or `FontFace` in the worker) before frame 0. System font stacks
   today; see Known gaps in CLAUDE.md.
4. UI: Export button → dialog (format, quality **open**), progress bar, cancel, then download via an
   object URL (revoked afterwards), file named after the project.
5. Tests: unit tests for the frame-schedule and `assetsAt` logic; an e2e test that exports a short
   story and checks the output's duration and size, plus pixel-compares a couple of decoded frames
   against `renderFrame` in the page.

## Open questions for the user

- Quality presets (bitrate) and whether to offer 720p as a faster option.
- Whether editing stays enabled during export (export a snapshot) or is locked.
- Whether to include a short "you're responsible for music rights" notice now or with audio (M6).
