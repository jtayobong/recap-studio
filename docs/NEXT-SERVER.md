# Plan: a local Linux server (Docker, AMD VA-API) with server-side export

Status: **draft plan, not started, not committed** (2026-11-26). The open questions are answered
(§10, user, 2026-11-26). If the work goes ahead, the choices become
D36+ in `DECISIONS.md`.

## 1. Goal and honest expectations

**Goal:** Recap Studio is served from a local Linux server: a Docker container on **Linux
installed directly on the machine (no Windows underneath)**, with the machine's AMD Radeon
RX 9070 (RDNA 4) passed through for hardware encoding via VA-API. Export can run on that server
instead of in the browser: the browser sends the project snapshot and its media, the server
renders and encodes, and the browser downloads the file. Windows with WSL2 stays a supported
**CPU-only** setup, for development and for machines without a usable GPU. The server finds out
at startup which encoders actually work and falls back to x264/x265.

**What this does and doesn't buy.** Today's numbers (CLAUDE.md, D31): encoding is about 97 % of
export time, and real Edge on Windows with hardware H.264 exports a 30 s story in about 5 s
(190 fps). With the RX 9070's encoder (VCN) through VA-API, the server should be in the same
range for H.264/HEVC/AV1. Frame drawing (Skia on the CPU) and the RGBA → NV12 upload may become
the limit instead, especially at 4K: phase 2 measures it. Without the GPU (WSL2, or VA-API
unavailable), x264 is usually **slower** than Edge's hardware encoder, though the quality per
bit is better. On Linux the browser path matters less: Chrome for Linux usually encodes H.264 in
software, so the server is the fast path there. The real gains are:

- **Hardware encoding on Linux:** H.264, HEVC and AV1 up to 4K through VA-API (`h264_vaapi`,
  `hevc_vaapi`, `av1_vaapi`).
- **Encoder choice:** x264 (better quality per bit), HEVC, AV1, ProRes, 4K, GIF. All of these are
  listed as postponed in PLAN.md §8.
- **No browser dependency for export:** Firefox/Safari, and the macOS/Linux desktop WebViews that
  D34 ruled out because WebKit lacks WebCodecs H.264, could export through the server.
- **Headless and batch exports:** exports run without a browser tab open, can be queued, and
  could be scripted.
- **The browser stays responsive:** it already does (the export runs in a worker), so this is a
  small gain.

The browser export stays. Server export is a second path chosen in the Export dialog, and the
app keeps working with no server at all.

## 2. What the codebase already gives us

- `renderFrame` is pure and deterministic (invariant 4), so it can run anywhere that has a
  Canvas 2D implementation. It uses only a small part of the API: paths, gradients, `fillText`,
  `measureText`, `clip`, `roundRect`, `drawImage` and `imageSmoothingQuality`. There are no
  filters, no `getImageData` and no DOM access in `src/render`.
- Media decoding for export can be swapped out: `createExportMedia(assets, { decodeImage,
  openVideo })` in `exportMedia.ts`. The planning pass, the frame-exact timestamp lists and the
  free-after-last-use logic can be reused unchanged with an ffmpeg-backed `VideoFrameReader`.
- The audio mix is pure (`audioMix.ts`, `clipSound.ts`, `domain/music.ts`). It needs decoded
  48 kHz stereo float blocks, which ffmpeg can produce.
- The worker request is already the right shape for a network job: `WorkerEncodeOptions` (format,
  style, scenes, codec, bitrate, music) plus `assets: id → { kind, file, durationMs }`
  (`export.worker.ts`). The same snapshot becomes the job's JSON plus uploaded files.
- `presets.ts` (`bitrateFor`, `exportFilename`), `timeline.ts` (`frameCount`, `frameToMs`) and
  `codecString.ts` are pure and can be shared.
- CSP `connect-src 'self'` already allows requests to the server, provided it serves the app and
  the API from the same origin.

What is browser-only today: Mediabunny encoding and decoding (WebCodecs), `OffscreenCanvas`,
`createImageBitmap`, Dexie/IndexedDB and OPFS. All storage stays in the browser in this plan (see
decision Q2).

## 3. Architecture options for server-side export

| | A. Browser renders, server encodes | **B. Server renders and encodes (recommended)** | C. Headless Chromium on the server |
|---|---|---|---|
| How | Worker draws frames as today, streams raw frames to the server, ffmpeg encodes | Node runs `renderFrame` on a Skia canvas (`@napi-rs/canvas`), decodes media with ffmpeg, pipes raw frames to ffmpeg | Playwright/Chromium in the container runs the existing worker code; frames are read back and sent to ffmpeg |
| Data sent | ~8 MB per raw frame (1080×1920 RGBA): ~7.5 GB for a 30 s story at 30 fps, 15 GB at 60 fps | Project JSON plus the media files, uploaded once (already compressed) | Same as B |
| Match with preview | Exact (same drawing code and engine) | Close: Chrome draws with Skia too, but text antialiasing and fonts need a parity test | Close to exact |
| New pieces | Frame transport (WebSocket), backpressure | Canvas library, ffmpeg decoder, Ctx2D type widened | ~400 MB Chromium image; essentially Remotion's model, rejected in D2 |
| Verdict | Dropped: the transfer costs more than the encode it saves, especially across WSL2's NAT | **Recommended:** small transfer, works headless, true offload | Fallback if B can't reach parity |

The spike (phase 2) measures B against the existing parity thresholds. If B can't get there, C is
the fallback, not A.

## 4. Target runtime layout

Main target, Linux installed directly on the machine (one machine; the browser is on the same Linux desktop):

```
Chrome/Edge for Linux                          Docker (host kernel ≥ 6.14, Mesa ≥ 25 in the image)
 http://localhost:4173  ── loopback ──────────►  container "recap-server"   --device /dev/dri  (RX 9070, VA-API)
   app (IndexedDB/OPFS stay here)                  Node 22+ (node:http, no framework)
   Export dialog: "This browser" | "Local server"   ├─ GET  /*                static dist/ + same headers/CSP as vite preview
                                                     ├─ POST /api/jobs          job JSON (snapshot + options) → job id
                                                     ├─ PUT  /api/jobs/:id/assets/:assetId   streamed file upload
                                                     ├─ POST /api/jobs/:id/start
                                                     ├─ GET  /api/jobs/:id/events   SSE progress
                                                     ├─ GET  /api/jobs/:id/output   the MP4
                                                     ├─ DELETE /api/jobs/:id        cancel + wipe
                                                     └─ GET  /api/capabilities     encoders that passed a test encode (vaapi h264/hevc/av1, x264, x265, prores…)
                                                   worker_threads: render (Skia) → ffmpeg stdin (rawvideo)
                                                   ffmpeg: decode clips/songs (CPU), hwupload → *_vaapi encode, mux
                                                   /jobs on a volume, wiped after download/timeout
```

CPU-only alternative, Windows + WSL2: the same container under Docker in WSL2 (no `/dev/dri`),
with the Windows browser reaching it through WSL's localhost forwarding.

A separate Linux box serving a Windows PC over the network is out of scope (Q8).

One origin serves both the app and the API, so the CSP is unchanged and there's no CORS. The
desktop app (`https://tauri.localhost`) is a separate follow-up (§9).

## 5. Phases

Each phase ends working and tested, the same way the milestones did. `npm run check` and the
e2e suites keep passing throughout, and the browser export path never regresses.

### Phase 0: decisions and environment (no code)

- Answer the open decisions in §10.
- **Linux on the RX 9070 machine:** a distribution with kernel **6.14+** and current
  `linux-firmware` (RDNA 4 needs the VCN 5 firmware), e.g. Ubuntu 25.04+/Fedora 42+. These
  version numbers are from memory: confirm them with the check below, not by trusting the list.
  Install Docker Engine (not Docker Desktop). Your user and the container need the `render` group.
- **GPU check, on the host and then in a test container:** `vainfo --display drm --device
  /dev/dri/renderD128` should list `VAEntrypointEncSlice` for H.264 (High), HEVC (Main/Main10)
  and AV1 (Main). Then encode a test clip:
  `ffmpeg -vaapi_device /dev/dri/renderD128 -f lavfi -i testsrc2=s=1080x1920:r=30 -t 5 -vf format=nv12,hwupload -c:v h264_vaapi out.mp4`.
  If `vainfo` shows no encode entry points, check the kernel, the firmware and the Mesa version
  before writing any code.
- Install Chrome or Edge for Linux on the same machine, for the browser side.
- Optional dev loop on Windows (CPU only): WSL2 updated (`wsl --update`) with Docker Engine in an
  Ubuntu distro. Keep that clone **inside the WSL filesystem** (`~/src/recap-studio`), not under
  `/mnt/c`: file watching and npm installs on `/mnt/c` are slow and unreliable.

### Phase 1: serve the app from Linux (Docker)

The app is served from Linux. Nothing about export changes yet.

1. Make the existing scripts work on Linux (installed on the machine, and in WSL): Node 22.12+
   (nvm), `npm ci`, `npm run check`, then `npx playwright install --with-deps chromium` for e2e.
   Tauri commands stay Windows-only, so document that.
2. `server/` (new, Node, no framework): serves `dist/` with exactly the headers that
   `vite.config.ts` `preview` sends, imported from `src/security/policy.ts` (one source, like the
   Tauri config). It also sets SPA fallback to `index.html`, correct MIME types for `.js` and
   `.wasm`, and `Cache-Control` for hashed assets. It binds `127.0.0.1` by default. Built with
   `vite build --ssr server/main.ts`, so there's no new TypeScript runner dependency.
3. `Dockerfile` (multi-stage): a build stage (`node:22`, `npm ci`, `npm run build`, server build)
   and a runtime stage (non-root user, `dist/` + `dist-server/` only). The runtime base must
   have **Mesa ≥ 25 with the radeonsi VA-API driver** (`mesa-va-drivers`), plus `libva`, `vainfo`
   and an ffmpeg built with VA-API: e.g. Debian 13 (trixie) or newer. Debian 12 (bookworm) ships
   Mesa 22, which predates RDNA 4. Pin the base image by digest. Add a `compose.yaml` with
   `ports: ["127.0.0.1:4173:4173"]`; Docker's default `0.0.0.0` would expose the editor to the
   LAN, so the address must be given. A `compose.gpu.yaml` override adds
   `devices: ["/dev/dri/renderD128"]` (the render node only, not the display card) and
   `group_add` with the host's numeric `render` GID, which differs per distribution, so it comes
   from an `.env` file.
4. Tests: `playwright.server.config.ts` runs the existing non-`@dev` e2e flows against the
   container (the same set as `test:e2e:prod`), and adds a header test like the `@prod` one.

**Origin warning:** storage is per origin (scheme + host + port). Serving on
`http://localhost:4173` shares data with `npm run preview` in the same browser. Any other port, the
dev server (`:5173`) or the desktop app (`tauri.localhost`) won't see those projects. Projects
made in Windows Edge don't move to the Linux machine's browser at all: they're separate browsers
on separate operating systems, and the planned project bundles (NEXT-M9 candidate 2) are the way
to move them. Always open the app as `localhost`, **never an IP address** (a LAN address or the
WSL VM's `172.x.x.x`): plain HTTP to an IP isn't a secure context, so OPFS and the capability
check fail. Under WSL2, if NAT-mode localhost forwarding is unreliable, use mirrored networking
(`networkingMode=mirrored` in `.wslconfig`).

**Done when:** `docker compose up` serves the app on `http://localhost:4173` to Chrome/Edge on
the Linux machine (and, CPU-only, to Windows Edge through WSL2). Projects, media import and
browser export all work, and the e2e suite passes against the container.

### Phase 2: spike, rendering in Node

Find out whether the server's frames match the browser's, and how fast it is, before building
anything around it.

1. Add a canvas library (proposed: `@napi-rs/canvas`, Skia-based like Chrome, prebuilt binaries
   and no install script). **This is a new dependency: ask first** (CLAUDE.md).
2. Widen `Ctx2D` in `render/context.ts` to a structural interface covering the API the templates
   use, so both DOM contexts and the Skia context satisfy it. Run the portrait baseline before and
   after: it must not change.
3. Fonts: the display stack starts with `"Arial Black"`, which isn't on Linux. Its license
   doesn't allow bundling it, and `ttf-mscorefonts-installer` is not a fix. Options (decision
   Q4): (a) self-host an OFL font in `public/fonts`, loaded with `FontFace.load()` in the page and
   worker and registered with `GlobalFonts` on the server (the M7 rule in CLAUDE.md). This
   changes portrait output once, deliberately: re-record the baseline. (b) Pick metric-compatible
   fonts on the server only and accept that its output differs. Install Noto Color Emoji and Noto
   CJK in the image for fallbacks either way.
4. Harness: render the e2e stories (starter, all 8 templates in both shapes, accents, emoji and
   CJK text) in Node and in Chromium, then compare with the existing metric: mean |Δ| per channel
   and the share of pixels off by more than 48. Target: the export e2e thresholds (mean |Δ| ≤ ~1.2).
5. Speed, on the RX 9070 machine: time `renderFrame` plus pixel readback per frame. Measure
   ffmpeg encode fps for `h264_vaapi`, `hevc_vaapi` and `av1_vaapi` against `libx264`
   (`veryfast`/`medium`) and `libx265`, at 1080×1920 and 2160×3840, 30 and 60 fps. Compare two
   ways of handing frames to the GPU: (a) convert to NV12 on the CPU, then `hwupload`, and
   (b) `hwupload` the RGBA frames and convert on the GPU with `scale_vaapi=format=nv12`. Check
   whether drawing frames or encoding is the limit; if drawing is, render frames in several
   `worker_threads` in parallel and keep them in order.
6. Quality: at each preset's bitrate, compare VA-API against x264 by eye and with a simple
   metric (ffmpeg's `ssim`/`psnr` filters against a lossless reference) on the starter story and
   a photo-heavy story. Expect VA-API to need somewhat higher bitrates for the same quality, and
   record a per-encoder bitrate factor for `bitrateFor`.

**Done when:** a short report goes into this file with parity numbers per template, fps per
encoder and size, the quality comparison, and a go / no-go for option B (fallback: C).

### Phase 3: the export engine on the server (no UI yet)

1. `server/export/encodeOnServer.ts` mirrors `encodeStory`. It runs the planning pass with the
   shared `createExportMedia`, draws each frame with `renderFrame` on a Skia canvas, and writes
   raw RGBA to `ffmpeg -f rawvideo -pix_fmt rgba -s WxH -r fps -i pipe:0`, respecting pipe
   backpressure. Frames are drawn in a `worker_thread`, so the HTTP server stays responsive.
2. Encoder settings follow the existing contract: a bitrate from `bitrateFor` (`-b:v`, plus
   `-maxrate`/`-bufsize`), a keyframe every `KEY_FRAME_INTERVAL_S` (`-g`), `yuv420p`,
   `-profile:v high` with the level from `codecString.ts` (4.0 at 30 fps, 4.2 at 1080p60), AAC
   160 kbps at 48 kHz stereo, and `-movflags +faststart`. These are the same files an existing
   player test accepts.
3. **Encoder backends** behind one interface (`server/export/encoders.ts`), each turning those
   settings into ffmpeg arguments:
   - *VA-API* (preferred when it passed the startup test): `-vaapi_device
     /dev/dri/renderD128`, then `-vf format=nv12,hwupload` or the GPU-side conversion (whichever
     phase 2 found faster), and `-c:v h264_vaapi` with `-rc_mode VBR`, `-b:v`/`-maxrate`,
     `-profile:v high` and `-level` from `codecString.ts`. `hevc_vaapi` (`-tag:v hvc1`) and
     `av1_vaapi` work the same way. The per-encoder bitrate factor from phase 2 applies.
   - *Software*: `libx264`/`libx265` with the same rate settings.
   - *Startup probe:* for each candidate, a one-second test encode (`-f lavfi -i testsrc2`) at
     1080×1920, 1920×1080 and 2160×3840. `ffmpeg -encoders` only lists what was compiled in, not
     what works on this GPU. The results feed `/api/capabilities`. If a VA-API encode fails in
     the middle of a job (a GPU reset, the device being busy), the job fails with a clear message,
     and the user can retry with the software encoder. There's no silent mid-job fallback, which
     would produce a file that doesn't match what was chosen.
   - Clip decoding stays on the CPU by default: frames have to come back to the CPU for Skia
     anyway. `-hwaccel vaapi` with `hwdownload` is an option only if phase 2 shows decoding
     matters (D31 says it didn't in the browser).
4. Media: `decodeImage` uses Skia `loadImage`, with the same 2160 px cap. `openVideo` uses an
   ffmpeg reader that decodes to raw frames and returns "the last frame at or before t" for the
   planned timestamps, matching `MediabunnyVideoReader`'s rule. Decoding forward once is enough,
   because the timestamps are in order per stream.
5. Audio: ffmpeg decodes each source to `f32le` 48 kHz stereo, then the existing `audioMix.ts`
   runs on it, so music fades, ducking and clip edges are identical to the browser export. The
   result goes to ffmpeg as a second input (a named pipe or a temp `.f32` file). Keep the D27
   rule that audio problems never fail an export: produce a silent video plus `music.note`.
6. Same result shape as `EncodeResult`: totalFrames, timings, `mediaFailures`, `music`. It also
   reports `encoder` (e.g. `h264_vaapi` or `libx264`).
7. Tests: unit tests for the ffmpeg argument builder (both backends) and the frame-time rule. An
   integration test (tagged `@ffmpeg`) exports the starter story with the software encoder and
   checks it with ffprobe: duration, frame and packet count, codec and level, and an audio track.
   The same test tagged `@gpu` runs with `h264_vaapi`/`hevc_vaapi`/`av1_vaapi`, only on a machine
   with `/dev/dri`; it's skipped elsewhere (WSL, CI), with the skip reported rather than silent.

**Done when:** on the RX 9070 machine, the server exports the M5 done-when story (30 s, photos, a
clip held past its end, transitions) and the 60 fps story with `h264_vaapi` and with `libx264`.
Both files' frames match the browser renderer within the phase 2 thresholds, after allowing for
the encoder's loss, which is checked against an x264 reference.

### Phase 4: job API and Export dialog integration

1. Job lifecycle: create → upload assets → start → progress (SSE) → download → delete. One
   running job at a time (a queue later). Limits come from `MEDIA_LIMITS` (sizes, durations, and
   only the assets the snapshot references). Jobs expire after N minutes. Cancel kills ffmpeg and
   the render thread, and wipes the job folder.
2. Client: `export/serverExport.ts` implements the same interface as `exportStory`
   (`ExportedFile`, `onProgress`, `signal`, `AbortError` on cancel). That way `exportStore.ts`,
   the header status, Try again and `useBlocker` work unchanged. Uploads use `fetch(PUT, blob)`
   per asset; Blob bodies work over HTTP/1.1, unlike streamed request bodies.
3. Export dialog: a "Where to export" choice, *This browser* or *Local server*, offered only when
   `GET /api/capabilities` answers. The server's encoder list drives what is enabled, the same
   way the 60 fps option works (D35). The dialog shows **GPU (VA-API)** or **CPU** next to the
   choice; hardware is the default where it passed the startup probe, with "Use CPU encoder
   (slower, best quality)" as an option. UI-only state, nothing saved (invariant 8). The System
   page gets a "Local server" section listing each encoder with "GPU" / "CPU" / "not available"
   and the reason (e.g. "no /dev/dri in the container").
4. Tests: e2e against the container, covering export through the UI to download, cancel,
   missing media, no-music fallback, and the server being unavailable (the option is disabled
   and the browser export still works).

**Done when:** from Chrome/Edge on the Linux machine, a story with photos, a clip and music
exports through the local server via the UI with the GPU encoder, the download plays, and
cancelling mid-export leaves no job files behind. The same flow works CPU-only under WSL2 from
Windows Edge.

### Phase 5: new output formats (in scope: HEVC, 4K, ProRes, GIF)

The RX 9070 encodes HEVC, AV1 and 4K in hardware through VA-API. ProRes and GIF have no
hardware encoder on any GPU, so they always run on the CPU. Each format is its own step, with
its own Export dialog option, preset, server capability flag and ffprobe-based tests (plus a
`@gpu` variant where VA-API applies). The browser path stays H.264/VP9 only, and these options
show only when *Local server* is chosen.

1. **HEVC (H.265) MP4**: `hevc_vaapi` on the GPU, `libx265` as the CPU fallback. Use
   `-tag:v hvc1` so Apple players and Windows Media Player accept it, Main profile, and a level
   from the size and frame rate like `codecString.ts`. Bitrate about 60 % of H.264 at the same
   preset, adjusted by the phase 2 quality factor. On the GPU it's about as fast as H.264; on the
   CPU, x265 is several times slower than x264, which the time estimate shows.
2. **4K output** (2160×3840 / 3840×2160; H.264 level 5.1/5.2, HEVC, or AV1). With VA-API the
   encoder copes. Drawing a 33 MB RGBA frame on the CPU, plus the upload, is the likely limit,
   so parallel render threads (phase 2) matter most here. Renderer: templates are
   sized from `unitOf`, so they scale. Check with contact sheets and text-bounds tests at 4K, and
   check that the portrait baseline is unchanged at 1080×1920. Media limit: photos are stored at
   ≤ 2160 px (D16/D18), so at 4K they're upscaled up to 1.8×, and so are clips (`MAX_EDGE` 2160).
   Decided (Q7): accept the upscaling and say in the dialog that media may look softer at 4K. Bitrates come from `bitrateFor`'s
   pixel scaling (×4). Without the GPU, expect x264 at 4K to be roughly 4× slower than at 1080p.
3. **ProRes MOV** (`prores_ks`, 422 HQ, 10-bit `yuv422p10le`, PCM or AAC audio). Files are large
   (≈ 200+ Mbps at 1080p30, so ~1 GB per minute). The server streams the download
   (`/api/jobs/:id/output`) rather than the browser holding a Blob. Check the free space on the
   job volume before starting.
4. **GIF** (no audio, so the music and clip sound are left out, stated in the dialog). Use
   ffmpeg's two-pass `palettegen`/`paletteuse` with a reduced frame rate (15 fps) and width
   (e.g. 540 px) by default, plus a size estimate. Long stories make huge GIFs, so cap the
   duration or warn.

5. **AV1** (not requested, but nearly free here): `av1_vaapi` in MP4 on the RX 9070, about
   50–60 % of the H.264 bitrate. There's no practical CPU fallback (SVT-AV1 is slow at these
   sizes), so the option appears only when the GPU probe passed (decided: Q7).

Also possible later: batch and queueing, and a CLI (`node dist-server/cli.js export project.json`).
Not planned: GPU encoding under WSL2. AMD has no native VA-API there, and the Mesa D3D12 VA-API
layer is experimental and unproven on RDNA 4. NVENC doesn't apply (AMD GPU).

### Phase 6: docs and wrap-up

README (running with Docker on Linux and on WSL, ports, the origin warning, GPU setup: kernel,
firmware, `vainfo`, the `render` group, `compose.gpu.yaml`), CLAUDE.md (the new
`server/` area, commands, invariants for the server), decision records, and this file updated
with results.

## 6. Code changes at a glance

| Area | Change |
|---|---|
| `src/render/context.ts` | `Ctx2D` widened to a structural interface (portrait baseline must be unchanged) |
| `src/export/` | `serverExport.ts` (client); `exportStory`'s snapshot building factored out so both paths send the same snapshot |
| `src/components/ExportDialog.tsx`, `export/exportStore.ts` | "Where to export" choice; encoder options from the server |
| `src/lib/capabilities.ts`, `SystemPage` | Optional "Local server" probe |
| `server/` (new) | `main.ts` (static + API), `jobs.ts`, `export/encodeOnServer.ts`, `export/ffmpegReader.ts`, `export/ffmpegArgs.ts`, `render.worker.ts` |
| Root | `Dockerfile`, `compose.yaml`, `.dockerignore`, `playwright.server.config.ts`, npm scripts (`server:build`, `server:start`, `docker:up`, `test:e2e:server`) |
| Unchanged | Domain model, schema (no migration), repositories, templates, preview, the browser export path, the Tauri shell |

## 7. Invariants and how they hold

- **Single source of truth (1):** the server receives a snapshot, like the worker does, and never
  stores projects in this plan.
- **Schema (2):** no change, and nothing to migrate.
- **Repositories (3):** the browser still reads assets through `assetRepository` and uploads the
  same Blobs it would post to the worker.
- **Pure renderer (4):** the same `renderFrame` runs on the server. Server media comes through the
  same `MediaResolver` contract. The parity test is the new guard.
- **UI-only export state (8):** the "where" choice and job ids are never saved.
- **Local-only (9)** is the one that changes meaning. The rule becomes "data leaves the browser only
  to a server on this machine, bound to loopback". That needs an explicit decision record (Q1),
  and a README line so it doesn't read as an upload service.

## 8. Security (local server)

- Bind `127.0.0.1` only, and publish Docker ports as `127.0.0.1:4173:4173`.
- **DNS rebinding and other sites:** any web page can send requests to `localhost`. Reject any
  `Host` other than `localhost:<port>` or `127.0.0.1:<port>`. Require `Origin` to match on every
  API call. Send no CORS headers. Require a custom header (e.g. `X-Recap-Client: 1`) on
  POST/PUT/DELETE, which forces a preflight that the server rejects.
- **Untrusted media goes to ffmpeg:** sniff magic bytes again on the server, enforce
  `MEDIA_LIMITS`, run ffmpeg with `-protocol_whitelist file,pipe` and no network, set timeouts
  and memory limits, and use only one input per known asset path, never a user-controlled path.
  Asset ids are validated by the existing id format before they become file names.
- **Container hardening:** non-root user, `read_only: true` with a tmpfs for `/jobs`,
  `cap_drop: [ALL]`, `no-new-privileges`, CPU/memory/pids limits, an image pinned by digest, and
  apt packages pinned where practical. The container needs no outbound network, so it uses an
  internal network with only the published loopback port.
- **Personal data:** job folders are wiped after download, cancel, or expiry, and on startup. No
  project content goes in logs (listening stats are personal data, PLAN.md §7). Uploaded photos
  may carry EXIF/GPS: they're deleted with the job and never reach the output.
- The production CSP stays as it is, with same-origin `connect-src 'self'`. Validate the job
  JSON with the same Zod schemas (`ProjectSchema` pieces) on the server.

## 9. Risks and open technical questions

- **Text parity (highest risk).** Fonts and antialiasing between Chrome and Skia-in-Node. Self-
  hosted fonts (Q4) are probably needed either way. They also fix the existing "output differs
  between machines" gap.
- **Speed expectations.** With VA-API, CPU-side frame drawing and the upload, not the encoder, may
  set the speed, especially at 4K. Without the GPU, x264 at 1080×1920 may be slower than Edge's
  hardware encoder. Show measured fps from phase 2 before committing to phase 4.
- **RDNA 4 driver maturity.** The RX 9070 is a recent GPU, and VA-API encoding depends on the
  kernel, the firmware and Mesa all being new enough. Early releases may have encoder bugs (rate
  control, AV1 quirks). Mitigations: the startup probe, the CPU fallback offered in the dialog,
  the `@gpu` tests, and Mesa pinned in the image. Upgrading Mesa is a deliberate image change
  with the GPU tests rerun.
- **Hardware encoder quality.** At the same bitrate, VCN is usually a bit behind x264/x265.
  Phase 2's quality factor sets the preset bitrates; the dialog offers the CPU encoder for
  "best quality".
- **GPU access in the container.** Passing `/dev/dri/renderD128` grants the container the GPU's
  render node only (no display card, no `--privileged`). ffmpeg parsing untrusted media now also
  talks to a kernel GPU driver, which is a larger attack surface than CPU-only. The hardening in
  §8 still applies, and the render node is the minimum needed.
- **WSL2 specifics (CPU-only setup).** Localhost forwarding sometimes breaks after sleep or a VPN connection
  (mirrored mode helps). The VM's memory cap is set in `.wslconfig`: give the VM enough for 2 GB
  clips plus decode buffers. Docker Desktop's license applies to larger companies; Docker Engine
  inside WSL avoids that.
- **Desktop app (Tauri).** Its origin is `https://tauri.localhost`, so calling
  `http://localhost:4173` from it is a mixed-content, cross-origin request. Supporting it needs a
  CSP `connect-src` addition, CORS with an allowlist of exactly that origin, and probably HTTPS on
  the server. Recommend leaving this for later.
- **Mediabunny in Node.** Mediabunny has no WebCodecs in Node, so the server uses ffmpeg for
  decode and encode. The parts of `src/export` that import `mediabunny` (`videoReader.ts`,
  `audioSources.ts`, `target.ts`, `encodeStory.ts`) must not be pulled into the server bundle.
  The shared code (`exportMedia.ts`, `audioMix.ts`, `presets.ts`, `codecString.ts`) is already
  separate from them.

## 10. Decisions (answered by the user, 2026-11-26)

- **Q1 → opt-in per export.** The Export dialog offers *This browser* (default) or *Local
  server*. "Local-only" is restated as "data leaves the browser only to a loopback server on
  this machine" (a decision record).
- **Q2 → the browser keeps projects and media.** The server is a stateless export service, and
  job files are wiped after download, cancel or expiry.
- **Q3 → Docker.** Running `server/` directly in WSL is documented as the dev loop.
- **Q4 → self-host an open (OFL) display font** in the page, the worker and the server. Portrait
  output changes once, deliberately: re-record the baseline. Phase 2 must pick the font, and its
  license file ships with it.
- **Q5 → `@napi-rs/canvas`** (new dependency approved in principle; pin the version and give it
  the usual two weeks). Headless Chromium stays the fallback if the phase 2 parity check fails.
- **Q6 → AMD Radeon RX 9070, on Linux installed directly on the machine, with VA-API** (revised
  by the user, 2026-11-26; originally "no NVIDIA GPU, CPU only"). Docker gets the render node
  (`/dev/dri/renderD128`). `h264_vaapi`/`hevc_vaapi`/`av1_vaapi` are preferred when the startup
  probe passes, and x264/x265 are the fallback. Windows + WSL2 stays a supported CPU-only setup;
  GPU encoding under WSL2 isn't planned.
- **Q7 → HEVC, 4K, ProRes and GIF** are all in scope (phase 5).
  - *AV1 → yes, GPU only* (user, 2026-11-26). `av1_vaapi` in MP4, shown only when the startup
    probe passes, with no CPU fallback (phase 5 step 5).
  - *4K media → accept upscaling* (user, 2026-11-26). The 2160 px cap for stored photos and
    decoded clips stays (D16/D18 unchanged, no migration). The 4K option in the dialog says
    photos and clips may look softer than graphics and text.
- **Q8 → same Linux machine** (user, 2026-11-26). The browser (Chrome/Edge for Linux) runs on the
  RX 9070 machine next to the server, so `localhost`, loopback-only binding and Q1's rule ("this
  machine") hold unchanged. A separate server box (an SSH tunnel, or HTTPS on the LAN) is out of
  scope; it would need its own decision.

### The questions as originally asked

- **Q1. Server's role and "local-only".** Is a loopback-only local server an acceptable
  reading of "no uploads" (with a decision record)? Is it opt-in per export (recommended), or
  should server export become the default when available?
- **Q2. Where data lives.** (a) Browser keeps projects and media; the server is a stateless
  export service *(recommended for this plan)*. (b) The server becomes the store (projects in
  SQLite, media on disk). That would give one library shared by the browser, the desktop app
  and other machines, and replace the "project bundles" candidate, but it's a much bigger
  migration that touches invariants 1–3.
- **Q3. Docker or plain WSL.** Docker (reproducible image, pinned ffmpeg and fonts, hardening
  flags) *(recommended)*, with "run `server/` directly in WSL" documented as the dev loop. Or plain
  WSL only.
- **Q4. Fonts.** Self-host an open (OFL) display font for browser and server (deliberately
  changes portrait output once), or keep system fonts and accept server/browser differences.
- **Q5. Renderer approach.** Option B (Node + `@napi-rs/canvas`, a new dependency) with C
  (headless Chromium) as the fallback.
- **Q6. GPU.** Is there an NVIDIA GPU on the dev machine, and is NVENC in scope (phase 5), or
  is x264 on the CPU enough? (Answered: no NVIDIA GPU; later revised to an AMD RX 9070 with
  VA-API on Linux.)
- **Q7. Formats.** Which new outputs (if any) are the reason for the server: HEVC, 4K, ProRes,
  GIF, or none (H.264 parity only)?
