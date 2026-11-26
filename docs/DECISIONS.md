# Decision log

Short records of the decisions made while building M0–M3 (November 2026), and why.
Add new entries at the bottom. If you reverse a decision, add a new entry rather than editing
the old one.

---

### D1. Scene-based story editor, not a timeline editor
Templates are the unit of features; scenes play end to end. This keeps scope sane and makes the
renderer a pure function of (project, time). A multi-track timeline is explicitly postponed.

### D2. Browser-only: Canvas 2D + WebCodecs/Mediabunny, not Remotion
Remotion is excellent (free for individuals and companies of up to 3 people), but it needs a
headless-Chromium render process and raises licensing questions if the project grows. A browser-only
pipeline has no server, uses hardware encoding, and keeps the "runs locally" promise. Cost:
we write our own small animation helpers. Mediabunny was chosen for muxing/encoding (Remotion itself
moved its WebCodecs work to Mediabunny).

### D3. One deterministic `renderFrame(ctx, project, timeMs)` for preview and export
Avoids the classic "looked right in preview, export differs" bug. Rules for templates are in
CLAUDE.md (no randomness/clock, `withAlpha`, fixed locale). Errors inside a template draw a message
card instead of crashing. `renderFrame` respects the caller's transform so the same function draws
1/10-scale thumbnails.

### D4. Project document in IndexedDB (Dexie); media in OPFS (from M4)
Small structured saves; binaries referenced by id. All Dexie access goes through a repository so
validation can't be skipped. Reads always go through `migrateProject`; corrupt or newer-version rows
are shown as "can't open" instead of breaking the list.

### D5. Autosave: debounced (500 ms) and serialized through a promise chain
Saves never race or land out of order; "All changes saved" is shown only if nothing changed during
the write. Flushed on editor close, tab hide, `pagehide`; `beforeunload` warns if unsaved.

### D6. Template fields as plain descriptors instead of Zod schemas
`render/fields.ts` defines text/number/boolean/choice descriptors. They resolve stored values
safely (never throw; bad values fall back to defaults) and generate the inspector UI directly,
which is awkward to do by introspecting Zod. The project document itself still uses Zod.

### D7. Capability check blocks only on core storage features
Missing OPFS/IndexedDB/secure context blocks the app with an explanation; missing encoders only
show a banner ("can edit, can't export"). Export target is probed at startup: MP4 (H.264 + AAC)
preferred, WebM (VP9 + Opus) fallback.

### D8. Original branding and palettes
App name "Recap Studio"; four original palettes (Neon Pulse, Citrus Pop, Midnight Wave, Mint Riot).
No Spotify name, logo, green, or typography anywhere.

### D9. Toolchain upgrades during setup
- **ESLint 10** (ESLint 9 reached end-of-life 2026-08-06) with eslint-plugin-react-hooks 7.1 and
  typescript-eslint ≥ 8.58. The v7 hooks rules forbid setting state in effects; two components were
  reworked (remount pattern / draft-while-editing pattern).
- **Vitest 5** (from 3) to fix `npm audit` findings: two critical (tinypool prototype pollution →
  RCE) and one moderate (@vitest/mocker), all dev-only. Vitest 5 requires Node ≥ 22.12 and
  Vite ≥ 6.4, hence `engines.node >= 22.12`.
- npm 11 `allowScripts`: esbuild's install script approved explicitly.

### D10. Playback and selection are separate, non-persisted stores
Playback time changes ~60×/s and must not trigger autosave or undo; selection is UI state. The
preview canvas subscribes to stores directly and redraws at most once per animation frame.

### D11. Undo/redo via whole-project snapshots
Immutable snapshots share unchanged structure, so they're cheap and can never drift from the
document. Limit 100 steps. Edits with the same `coalesceKey` less than 1 s apart merge into one step
(typing a word = one undo). Inside text fields the browser's own text undo applies; app undo
shortcuts work elsewhere.

### D12. Native HTML5 drag-and-drop for scene reordering (not dnd-kit)
The plan originally named dnd-kit. Native DnD plus keyboard (Alt+←/→) and button moves covers a
horizontal strip on desktop with no new dependency and was verifiable without installing packages.
Revisit only if touch support or fancier drag previews are needed.

### D13. Poster frames
Each template declares `posterMs`, the scene-local time at which it looks complete. Selecting a
scene seeks there; thumbnails render it; projects open on the first scene's poster instead of the
fade-in at 0:00.

### D14. Insert position and selection rules
New scenes go after the selected scene (or at the end). Deleting the selected scene selects its
neighbour. Duplicates are inserted right after the original and selected.

### D15. Media is owned by one project; duplicating a project copies its files
Decided at the start of M4. Each asset row has a `projectId`, and duplicating a project copies
every OPFS file under a new id and rewrites references (`remapAssetIds`). Costs disk space, but
deleting a project can simply delete its assets, with no reference counts that could drift and
orphan or over-delete files. Writes go files-first, row-last; deletes go row-first, files-last.
Anything left behind by a crash is removed by `sweepOrphans` (files only once they are an hour old,
so a sweep can't race an import running in another tab).

### D16. Import limits: images ≤ 80 MB, video ≤ 2 GB and ≤ 5 minutes
The user chose the looser option. Images are downscaled to 2160 px on the long edge before storing,
so the source limit mostly bounds decode memory. Video is streamed to OPFS, never fully read into
memory, and a full disk surfaces as `StorageFullError` with a clear message.

### D17. Media library changes are not undoable
Importing or deleting an asset happens immediately, outside project undo history. Deleting an asset
that a scene uses asks for confirmation. Placing or clearing media in a scene field is a normal,
undoable `setSceneField`. The crop focus point is set by clicking/dragging on the thumbnail (arrow
keys nudge it) and stored as `focusX`/`focusY` in 0–1.

### D18. Import processing rules
- Format is decided by magic bytes only; file name and browser-reported type are ignored. HEIC/AVIF
  (ISO-BMFF image brands) and generic Matroska are rejected, not guessed at.
- Images at or under 2160 px on the long edge are stored byte-for-byte (no quality loss, EXIF kept,
  including GPS: it never reaches canvas output, but a future project-bundle export must strip it).
  Larger images are re-encoded at 2160 px (JPEG/WebP keep their format, PNG/GIF become PNG), which
  also drops EXIF. GIFs are treated as stills (first frame): animation can't be rendered
  deterministically from (project, time).
- Video metadata comes from a `<video>` element until Mediabunny lands in M5. WebM files without a
  duration (MediaRecorder output) are handled by seeking past the end.
- The probe (`media/browserProbe.ts`) is injected into the importer, so the pipeline is unit-tested
  in Node with fakes and the browser parts are tested in Chromium (`e2e/media-import.spec.ts`).

### D19. Deleting library media always confirms and empties the slots that used it
Every library delete asks first (not only when the item is in use), because it can't be undone.
After the files are deleted, `forgetAsset` sets matching scene fields to `''` as a normal undoable
edit, so the project doesn't keep ids pointing at nothing. Undoing it brings the reference back,
which then shows as missing media. Tile status (thumbnail URL, missing file) lives in an external
store read with `useSyncExternalStore`, so no component sets state in an effect and object URLs
are created and revoked in one place.

### D20. Media reaches templates through a synchronous resolver
`renderFrame(ctx, project, t, media)` stays synchronous and pure; `media.frame(assetId, clipMs)`
answers with whatever is decoded now or `undefined`, and templates draw a placeholder then. The
caller decides how to get pixels ready:
- **Preview** (`media/mediaCache.ts`): loads on demand and asks for a redraw when something lands.
  Images are `ImageBitmap`s in a pixel-bounded LRU (closed on eviction), with the stored thumbnail
  as a stand-in while decoding. Clips use one muted `<video>` per asset (pool of 4): exact seek
  while paused, play-along while playing (re-seek only past 0.25 s drift), clips not on screen are
  paused. A clip shorter than its scene holds its last frame. This is approximate by nature
  (element seeking lands on the nearest decodable frame).
- **Scene thumbnails** use only the stored WebP thumbnails, so they never seek the preview's
  video elements, and redraw via their own change channel.
- **Export (M5)** must resolve every asset of a frame *before* drawing it (and decode video
  frame-exactly with Mediabunny), so exported frames are complete and deterministic.

### D21. Focus point as two number fields owned by the media slot; one undo step per gesture
`focusX`/`focusY` stay ordinary `number` fields (0–1) in `scene.fields`, so there's no schema
change and old scenes resolve to the center. A `media` field names them in `focus: { x, y, fit }`;
the inspector then hides them from the generic form and shows `FocusPicker` inside the slot. Both
values are written together with `setSceneFields`. Each gesture (a drag, a run of key presses, a
re-center) gets its own coalesce key: with a single shared key, the 1 s coalescing window merged
separate quick gestures into one undo step (found by the e2e test). Ken Burns (`motion`) zooms
up to 1.12× over the whole scene, centered on the focus point, and only when cropping.

### D22. Mediabunny 1.65.2 for encoding/muxing; export in a dedicated worker
Added for M5 (planned since D2). Pinned to 1.65.2, not the day-old 1.66.4: new releases get a couple
of weeks before we adopt them. MPL-2.0 (file-level copyleft; using it unmodified is fine), no
install scripts, only `@types` dependencies. The M5 spike showed a dedicated worker with an
OffscreenCanvas exports at about the same speed as the main thread (~200 fps at 1080×1920 on the dev
machine) while keeping the UI free, so export runs in a worker. Bitrates must be passed as
`new Quality({ bitrate })` (a bare number is a 0–1 quality level). `mediabunny` is listed in Vite's
`optimizeDeps.include` so its lazy import doesn't trigger a dev reload.

### D23. Export plans every frame's media up front
Export is deterministic, so before encoding it draws every frame once with a recording
`MediaResolver` (no decoding; a few ms for a whole story) and builds a plan: which images each frame
needs, and per video "stream" (the nth use of a clip within a frame) the full ordered list of clip
times. Then, per frame, exactly that media is decoded before the frame is drawn, and anything past
its last use is freed. Templates stay unaware of export. The plan is required, not just tidy:
Mediabunny's `canvasesAtTimestamps` reads timestamps ahead, so supplying them one frame at a time
deadlocked. Missing/undecodable media draws the placeholder and is reported (`mediaFailures`) so the
UI can warn instead of failing the export. In the worker, `self.fonts.ready` never resolved, so it
isn't awaited (system fonts need no loading; self-hosted fonts must use explicit `FontFace.load()`).

### D24. Export UI: options dialog, then a non-blocking status in the header
The user chose to keep editing during an export (snapshot), and a native modal `<dialog>` makes the
rest of the page inert, so the modal is only for choosing options. Progress, Cancel, Download and
errors live in the editor header, backed by a UI-only Zustand store (`export/exportStore.ts`). The
store lazy-loads the exporter, so Mediabunny and the worker are fetched only on the first export
(main bundle +8 kB). Leaving the editor cancels a running export and frees a finished file; closing
the tab mid-export asks first. The status area stays in the accessibility tree even when empty,
because a live region must exist before its content changes to be announced.

### D25. Audio import: magic bytes, plus an audio-only fallback for MP4/WebM
M6 accepts MP3, M4A/AAC, WAV, OGG and FLAC (user decision: up to 100 MB and 10 minutes), detected by
magic bytes like everything else. JPEG is checked before MPEG audio because both begin with 0xFF.
MP4/MOV and WebM can't be told apart from video by their first bytes, so they are probed as video
first; if there's no picture, the probe throws `NoVideoTrackError` and the importer imports the
file as `audio/mp4` / `audio/webm` (size limit re-checked against the audio limit). Audio assets
have no thumbnail (the tile shows ♪ and the duration), and the preview cache never tries to decode
them as images.

### D26. Project schema v2: music fades; `offsetMs` is the start point in the song
The user chose optional fades (fade in ~1 s off by default, fade out ~1.5 s on by default), which
are stored per project, so `AudioTrackSchema` gained `fadeIn`/`fadeOut` and the schema went to v2.
Migration 1→2 adds `fadeIn: false, fadeOut: true` to an existing track and leaves projects without
music untouched; it's tested with a real v1 fixture (`src/domain/fixtures/project-v1.json`) and in
the browser with a raw v1 IndexedDB row. `offsetMs` (unchanged) is defined as where in the song
playback starts; the music always begins with the story and plays once. Fade lengths are the
`MUSIC_FADE_IN_MS`/`MUSIC_FADE_OUT_MS` constants shared by preview and export.

### D27. Music export: decoded and mixed in the worker, interleaved with the video
`OfflineAudioContext` isn't available in workers, so the song is decoded with Mediabunny
(`AudioSampleSink`) in the export worker and mixed by hand: `mixMusicBlock` trims each block to the
music's span, applies `musicGain` (the same function the preview uses for its `<audio>` volume) per
frame and shifts it to story time. Mediabunny resamples to 48 kHz stereo (valid for both AAC and
Opus) and encodes at 160 kbps. Audio is added ~1 s ahead of the video frames rather than all at the
end, so the muxer never stalls on one track and memory stays flat. Music problems never fail an
export: a missing or undecodable song, or an unavailable audio encoder, produces a silent video
plus `music.note`, which the UI shows. The rights reminder is a muted line in the export dialog,
shown only when the story has music (user decision).

### D28. Transitions compose "previous" and "current"; schema v3; renderFrame clips to the frame
`drawTransition` receives two callbacks, "draw the previous scene" (the plain background for the
first scene) and "draw this scene", and each kind is a small composition of them: fade, slide up,
push left, zoom, wipe (a diagonal edge in −45° rotated coordinates so the clip is a rectangle,
with an accent band on it), flash (white peak at the cut, `easeIn` on both sides so it doesn't
linger). Adding transition kinds is a schema change: v3 only bumps the version (old documents stay
valid) so an older app says "saved by a newer version" instead of "invalid data". `renderFrame`
now clips everything to the frame rectangle first, because moving scenes would otherwise paint
outside it on any canvas larger than one frame.

### D29. Starter stories are data; the basic two-scene story stays for tests
Starters (`render/templates/starters.ts`) are plain lists of `{ template, duration, transition,
fields }` built with `createScene`, so they can't drift from the templates: a unit test checks that
every starter value is accepted unchanged by its template's field descriptors and that each starter
renders cleanly in every palette. The empty strip shows a picker of the three starters (user
decision) instead of "Add starter scenes"; the old Title + Big Number story remains as the
`addStarterScenes` action, which timing-sensitive e2e tests call via `e2e/helpers/story.ts`.

### D30. Clip sound: a template field, shared sound segments, and a real audio mixer
"Keep clip sound" is a `boolean` template field (`clipSound`) on the media templates, so stored
projects need no migration. `soundSegments(scenes, lookup)` derives when each video clip is heard
(the whole scene, from clip time 0, capped at the clip's length), using the convention that
templates draw clips at clip time = scene time; preview and export both use it, together with
`duckGain` (music at 30 %, 300 ms ramps; user decision). Mixing several sources at different rates
needed more than "encode the song": the export now decodes each source with Mediabunny,
resamples to 48 kHz stereo (linear interpolation), and sums blocks with per-frame gains and 15 ms
fades at clip edges (`audioMix.ts`, pure and unit-tested). Clips without an audio track are silent,
not an error. Preview mute now silences all preview sound.

### D31. Data router for navigation blocking; export speed is the encoder's
The app moved from `<BrowserRouter>` to `createBrowserRouter` so the editor can block navigation
(`useBlocker`) while an export is running or undownloaded, including the browser's Back button
(a click handler on the link alone wouldn't catch that); it also enables lazy routes. Profiling
the export (`timings` in the result) showed ~97 % of the time is the video encoder itself, so the
"slow export with media" gap was the test browser's software encoder: real Edge with hardware
encoding is ~3.7× faster. No pre-scaling or decode work was added, because it wouldn't help.
`Modal` now ignores the close event its own programmatic close causes (it fires asynchronously and
could dismiss a dialog reopened in the meantime).

### D32. Vendor chunk, Trusted Types, and e2e against the production build
A per-module size report showed the old 544 kB entry chunk was nearly all framework code (react-dom,
Dexie, Zod, React Router), so route-level splitting alone couldn't fix the size warning. Pages now
load on first visit, `node_modules` except Mediabunny go to a `vendor` chunk (cached across app
updates), and the warning limit is 600 kB with that rationale. The production CSP gained Trusted
Types with a single named policy that only accepts the bundled export worker's URL; `Permissions-
Policy`, COOP and CORP were added, and unused `data:`/`blob:` sources removed. Because the dev
server sends no CSP, `npm run test:e2e:prod` runs the e2e flows against `vite preview`; it caught
that Trusted Types also gates `new Worker()`. Tests needing `/src` imports are tagged `@dev`.

### D33. Landscape: one template, two geometries, sized from the shorter side
16:9 output (user decisions: switchable per project, landscape only, layouts designed for wide
frames, wide media defaults, portrait unchanged) needed no schema change: the project already
stored `format.width/height`. Each template keeps one drawing routine and picks a portrait or
landscape *geometry* (positions, column widths, line limits) with `isLandscape(frame)`; sizes use
`unitOf(frame)`, the shorter side, which equals the width in 9:16, so portrait output is
byte-identical. That was verified, not assumed: `portraitBaseline.test.ts` hashes every template's
draw calls (204 cases) and was compared after every template change. Separate landscape templates
were rejected (double the templates, and switching format would have to swap template ids).
Crop shapes for the focus picker stay plain data in the field descriptors, now per shape
(`aspect.byShape.portrait/landscape`), with `slotCropAspect` choosing for the project's format.
Switching format is a normal undoable project edit that keeps scenes and focus points. The
capability check requires the encoder at both sizes, so "can export" holds for either shape.
Square (1:1) stays "Later"; the same helpers make it a smaller job.

### D34. Desktop app: a thin Tauri shell around the unchanged web app
Of four options (installable PWA, Tauri, Electron, a small launcher), the user chose Tauri with a
per-user NSIS installer. On Windows, Tauri shows the bundled `dist/` in WebView2, which is Edge's
Chromium, so WebCodecs (H.264 export) and OPFS work as in desktop Edge, in a ~1.4 MB installer
instead of Electron's bundled Chromium (~100 MB). The shell has no plugins, no IPC and no
permissions: the web app stays the whole product and keeps working in the browser. The origin is
fixed to `https://tauri.localhost` (`useHttpsScheme`), a secure origin that must never change,
because storage is per origin. The same CSP/Permissions-Policy as the production web build comes
from one module (`src/security/policy.ts`) with a test against `tauri.conf.json`. The packaged app
is tested by attaching Playwright to WebView2 over CDP with a throwaway user-data folder
(`npm run test:desktop`). macOS/Linux builds are out: their system WebViews (WebKit) don't
reliably encode H.264 with WebCodecs. Not done: code signing and auto-update.

### D35. 60 fps is an export option, with codec levels chosen for the frame rate
The user chose 60 fps as a per-export choice in the Export dialog, not a project setting: the
project stays at `format.fps` 30, so there is nothing to migrate, save or undo, and the preview
(already `requestAnimationFrame`-smooth) is untouched. The exporter overrides `fps` in its snapshot
of the format; the renderer is time-based and clip decoding asks for each output frame's time, so
nothing else changes (a 30 fps clip shows each frame twice). All three presets are offered at
60 fps with bitrates ×√2 (`bitrateFor` already scaled with √(fps/30)); 30 fps stays the default and
the dialog never remembers 60 (UI-only export state). Mediabunny picks the H.264/VP9 level from
size and bitrate only, so 1080p60 would claim level 4.0, which allows ~30 fps; `export/codecString.ts`
picks the level from the frame rate too (H.264 4.2 `avc1.64002a`, VP9 4.1 at 1080p60) and the
exporter passes it as `fullCodecString`, both when probing (`pickTarget`) and encoding. At 30 fps it
gives exactly Mediabunny's strings, so 30 fps output is unchanged (an e2e test checks level 4.0).
The capability check probes 60 fps separately (both shapes, High's bitrate) as an *optional*
result: a browser that can encode 30 but not 60 still exports, and the dialog shows 60 fps
disabled with the reason rather than hiding it. Rejected: a project-level `format.fps` choice
(undo/migration surface for an output setting) and letting Mediabunny choose the level (a
non-conforming stream that strict hardware decoders may refuse).
