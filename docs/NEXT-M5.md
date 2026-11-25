# Next up: M5, export v1 (video)

**Goal:** render the story to an MP4 (H.264; WebM/VP9 fallback where H.264 encoding isn't available)
in a worker, with progress, cancel and a download, matching the preview frame for frame.

**Done when:** a 30 s 1080×1920 story with title, big-number and photo/video scenes exports to a
playable file whose frames match the preview at the same timestamps. `npm run check` and
`npm run test:e2e` pass.

Design notes; the open questions are settled (see **Decisions** at the end).

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

## Spike results (2026-11-25) ✅

`src/export/encodeStory.ts` (frame loop), `src/export/export.worker.ts` (worker + protocol),
`src/export/spike.ts` (harness + `inspectExport`), `e2e/export-spike.spec.ts`. Mediabunny 1.65.2.
Starter story (8.5 s, 1080×1920 @ 30 fps, 8 Mbps target) in Playwright's Chromium on the dev machine:

- **Speed:** worker ~1.2–1.5 s for 255 frames (≈175–215 fps); main thread about the same. A 30 s
  story ≈ 4–5 s. `renderFrame` is only ~50 ms of that; encoding dominates. Speed is not a risk.
- **Correct output:** H.264 in MP4, 1080×1920, exactly 8.500 s and 255 packets; plays in a
  `<video>` element. ~3.9 MB (the encoder undershoots the target on flat graphics; fine).
- **Matches the preview:** decoded frames vs `renderFrame` at 7 timestamps (incl. mid-animation and
  the slide transition): mean |Δ| ≈ 1/255, < 0.25 % of pixels differ by more than 48 (anti-aliased
  text edges after 4:2:0 chroma subsampling). System fonts render the same inside the worker.
- **Cancel** from the first progress message rejects with `AbortError`; the **VP9/WebM fallback**
  encodes and decodes correctly too.
- **Gotchas found:** `new Quality(8_000_000)` means quality *level* 8e6, not a bitrate (the encoder
  rejected "quantizer 0 / Infinity bps"); use `new Quality({ bitrate })`. Vite must pre-bundle
  `mediabunny` (`optimizeDeps.include`), or its first lazy import forces a dev-server reload.
- Not covered yet: media (photos/clips) in export, and the production build of the worker (the app
  doesn't import the exporter yet).

## Suggested breakdown

1. ~~Spike~~ done (above).
2. Export module (`src/export/`): worker entry, message protocol (start, progress, cancel, done,
   error), frame loop with `assetsAt` preloading, encoder config from the capability probe
   (`lib/capabilities.ts` already picks MP4 or WebM).
3. Fonts: `document.fonts.load` (or `FontFace` in the worker) before frame 0. System font stacks
   today; see Known gaps in CLAUDE.md.
4. UI: Export button → dialog (quality preset), progress bar, cancel, then download via an object
   URL (revoked afterwards), file named after the project. Editing stays enabled (snapshot export).
5. Tests: unit tests for the frame-schedule and `assetsAt` logic; an e2e test that exports a short
   story and checks the output's duration and size, plus pixel-compares a couple of decoded frames
   against `renderFrame` in the page.

## Decisions (confirmed with the user, 2026-11-25)

- **Quality:** always full output resolution (1080×1920 at the project's fps; no 720p), with three
  presets: *Standard* (~8 Mbps, default), *High* (~12 Mbps), *Smaller file* (~5 Mbps).
- **Editing during export:** allowed. Export renders a snapshot of the project taken when Export is
  clicked, in a worker; later edits don't affect a running export.
- **Music-rights notice:** added with audio in M6, not in M5 (M5 exports silent video).
