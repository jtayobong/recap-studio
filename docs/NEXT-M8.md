# Next up: M8, hardening

**Goal:** a fresh user can go from start to export with no dead ends: clear errors, safe limits,
recoverable failures, and the rough edges collected in M4–M7 smoothed out.

**Done when:** the happy path (new project → starter story → own media and music → export →
download) and the main failure paths (storage full, missing files, unsupported files, unsupported
browser, cancelled export) each have an e2e test and a clear, actionable message; the items marked
for M8 below are done or consciously dropped. `npm run check` and `npm run test:e2e` pass.

Design notes; the open questions are settled (see **Decisions** at the end).

## Progress

- **Step 1 done (2026-11-25): clip sound.** "Keep clip sound" (`clipSound` boolean template field
  on Photo / Video, Photo grid, carousel; no schema bump). `render/clipSound.ts` turns scenes into
  sound segments (video clips only, capped at the clip's length), shared by preview and export.
  `duckGain` (domain/music.ts): music at 30 % during clip sound with 300 ms ramps. Preview: clip
  elements unmuted only while audible and playing; M mutes all preview sound. Export: a real mixer
  (`audioMix.ts` resampler + block mixer, `audioSources.ts` Mediabunny decoding) replaces the
  music-only path; clips without an audio track stay silent. e2e measures 330/880 Hz tones
  separately (Goertzel) to prove the clip is heard and the music ducks only during its scene.
- **Step 2 done (2026-11-25): editor & export polish.**
  - *Export speed:* profiled with a timing breakdown in the export result (`timings`): the video
    encoder is ~97 % of the time; drawing (~75 ms) and media decoding (~0.4 s) for a 30 s story are
    negligible. In the installed Edge (hardware H.264) the same story exports in 4.7 s (190 fps)
    vs 17.3 s in Playwright's software-encoding Chromium. No code change needed; docs corrected.
  - *Leaving with an unsaved export:* the app now uses a data router (`createBrowserRouter`), and
    the editor's `LeaveGuard` (`useBlocker`) asks before leaving (link or browser Back) while an
    export runs or its file isn't downloaded; tab close asks too.
  - *Inspector:* `visibleWhen` on field descriptors; the grid shows only its layout's slots, the
    carousel reveals one slot at a time; filled slots always stay visible.
  - *Bug found:* `Modal` reported its own programmatic close (an async `close` event) as a user
    close, which could instantly dismiss a dialog reopened right after (the Back-button prompt).

## Collected for M8 (from earlier milestones)

- **Clip sound** (M7 decision): a "Keep clip sound" toggle on scenes with a video clip, with the
  music ducking under it, in preview and export. Needs audio mixing of clip tracks in the worker
  (and unmuted clip elements in the preview).
- ~~Export speed with media~~ (step 2: encoder-bound; fast with hardware encoding).
- ~~Leaving the editor discards a finished, undownloaded export~~ (step 2: asks first).
- ~~Inspector noise~~ (step 2: `visibleWhen`).
- **Storage**: quota warnings before it's full (System page already estimates usage), and a way to
  see/clean large media.
- ~~**Project bundle export/import**~~ deferred past M8 (user decision): zip of the project JSON +
  media; strip EXIF/GPS from photos kept byte-for-byte; validate everything on import (Zod,
  unknown templates, size caps / zip bombs).
- **Bundle size**: main chunk ~560 kB; route-level code splitting.
- **CSP review** and an e2e run of the main flows against `vite preview` in CI.
- **Fonts** differ slightly between operating systems (system font stacks); self-hosted fonts were
  declined for M7 and stay out of scope for M8.

## Decisions (confirmed with the user, 2026-11-25)

- **Scope, in this order** (plus the base done-when: happy path and failure paths with clear
  messages and e2e tests):
  1. **Clip sound:** a "Keep clip sound" checkbox per scene with a video clip; while that clip
     plays, the music **auto-ducks** to ~30 % and comes back after. Preview and export. Likely a
     `boolean` template field on the media templates (scene fields resolve to defaults, so no
     schema bump), rather than a new project-level field.
  2. **Editor & export polish:** profile and speed up exports with photos/clips; warn before
     leaving the editor with an undownloaded export; hide unused grid/carousel slots
     (`visibleWhen` on field descriptors).
  3. **Storage care:** warn before storage runs out; show which media takes the most space, with
     cleanup.
  4. **Build & security:** route-level code splitting, a CSP review, and the main e2e flows run
     against the production build (`vite preview`).
- **Project bundles:** not in M8; a later milestone (needs import validation and EXIF/GPS
  stripping).
- **Nothing else reported** by the user to prioritise.
- Self-hosted fonts: not raised; stays out of scope.
