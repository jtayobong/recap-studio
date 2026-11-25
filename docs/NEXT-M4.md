# M4, media: ✅ done (2026-11-25)

Kept as the design record for M4. What shipped is summarized under **Progress** below and in
DECISIONS.md D15–D21; the next milestone is in `NEXT-M5.md`.

**Goal:** import photos and video clips into local storage, show them in a media library, and use
them in a new Photo/Video scene template with fit and crop, visible in the live preview.

**Done when:** a user can drop a photo and a clip into the editor, put each into a scene, see them
in the preview and thumbnails, reload and still have them, and delete a project without leaving
orphaned files. `npm run check` and `npm run test:e2e` pass.

These are design notes from the planning so far. The **open** items were settled with the user
on 2026-11-25 (DECISIONS.md D15–D17): duplicate copies files; limits are images ≤ 80 MB, video
≤ 2 GB / ≤ 5 min; focus point is picked on the thumbnail; asset import/delete is not undoable.

**Progress:** step 1 done (asset model, Dexie v2, OPFS store, asset repository wired into project
duplicate/delete, `sweepOrphans` implemented but not yet called from the UI). Step 2 done
(`media/`: sniffing, limits, image downscale + thumbnails, video metadata + poster, quota check,
persistence request, cancel/progress; `importer.importFiles` is ready for the media panel).
Step 3 done (`MediaLibrary` + `AssetTile` in the editor's left panel: Import… button and drop zone,
progress with cancel, per-file errors, missing-file badge, confirmed delete that also empties
media slots via `forgetAsset`; orphan sweep runs once per page load from the Projects page).
Step 4 done (`media` field kind; `MediaSlotField` with Choose…/Replace… picker, Clear, drop of a
library tile or of files from the computer; tiles draggable via `media/dragData.ts`). To make the
slot usable, the Photo / Video template from step 6 was registered early with its `media`,
`caption` and `fit` fields and a placeholder render. Step 5 makes it draw media; step 6 adds
`focusX`/`focusY` + the focus picker and the Ken Burns zoom.
Step 5 done: `render/media.ts` (`MediaResolver` passed as `renderFrame`'s 4th argument and exposed
to templates as `frame.media`; `coverRect`/`containRect`/`drawMedia` already take focus + zoom for
step 6), `media/mediaCache.ts` (preview + thumbnail resolvers), Photo template draws media with
cover/contain. Checked by pixel-reading e2e (`e2e/media-preview.spec.ts`).
Step 6 done: `focusX`/`focusY` (edited by `FocusPicker` inside the media slot: click/drag, arrow
keys, Home/Center, crop outline when Fit is cover; each gesture is one undo step) and a `motion`
choice (slow zoom in/out/none, `kenBurnsZoom`) centered on the focus point.
Step 7 done: `e2e/media-project.spec.ts` (import, use, reload, duplicate, delete, storage empty);
the media specs also pass against `vite preview` with the production CSP.

## Suggested breakdown

1. **Asset model + storage**
   - `domain/asset.ts`: Zod `AssetSchema`
     `{ id, projectId, kind: 'image'|'video'|'audio', mime, filename, bytes, width?, height?, durationMs?, createdAt }`.
   - Dexie: bump the **database** version to 2 and add an `assets` table
     (`id, projectId, createdAt`). This is separate from the project document's `schemaVersion`.
   - Binaries in OPFS at `assets/<assetId>` (via `navigator.storage.getDirectory()`).
     Thumbnails can be small blobs in IndexedDB or OPFS `thumbs/<assetId>.webp`.
   - `db/assetRepository.ts`: the only code touching the assets table + OPFS (same rule as
     projects). Include `deleteForProject(projectId)` and call it from project delete; check that
     duplicate-project handles shared assets (**open:** copy files or reference-count?).
2. **Import pipeline** (`media/importAsset.ts`)
   - Accept via file input + drag-and-drop onto the media panel.
   - Validate by **magic bytes**, not extension (JPEG, PNG, WebP, GIF; MP4/MOV, WebM). Enforce limits
     (e.g. images ≤ 40 MB, video ≤ 500 MB / ≤ 2 min; **open:** exact numbers).
   - Images: decode with `createImageBitmap`; downscale anything larger than ~2× output
     (2160 px on the long edge) before storing. Generate a thumbnail.
   - Video: read metadata (duration, size) via a `<video>` element for now (Mediabunny arrives in
     M5); grab a poster thumbnail.
   - Write to OPFS with a streaming write; show progress; handle quota errors with a clear message.
3. **Media library UI** in the editor's left panel (under "Add a scene"): grid of `AssetTile`s
   (thumbnail, duration badge, "missing file" state), dropzone, delete (blocked or warned if used).
4. **`media` field kind** in `render/fields.ts`: value is an asset id (string). `FieldEditor` gets a
   `MediaSlotField` (pick from library / drop / clear). `resolveFields` keeps it a string or `''`.
5. **Renderer access to media.** `renderFrame` must stay synchronous and pure, so pass decoded
   media in:
   - Add an optional `media` argument, e.g. `renderFrame(ctx, project, t, media?: MediaResolver)`,
     where `MediaResolver.image(assetId) => CanvasImageSource | undefined`.
   - Preview: a `MediaCache` that loads `ImageBitmap`s from OPFS on demand and keeps one
     `<video>` per clip; for video, seek the element to the scene-local time (approximate frame).
     Request a redraw when an image finishes loading.
   - Templates draw a tasteful placeholder when the asset isn't ready or is missing.
   - Keep thumbnails working (`SceneThumbnail` passes the same resolver).
6. **Photo/Video template** (`render/templates/photo.ts`): fields `media`, `caption`,
   `fit: choice(cover|contain)`, crop focus (e.g. `focusX`/`focusY` numbers 0–1, **open:** UI for
   picking the focus point), gentle Ken Burns zoom driven by `localMs`; set `posterMs`.
7. **Tests**
   - Unit: magic-byte sniffing, limits, asset repository with fake-indexeddb (OPFS needs a small
     in-memory fake), `resolveFields` for `media`, renderer with a fake resolver (placeholder
     vs image drawn), template coverage via the existing "every template" test.
   - E2E: import a fixture image (`e2e/fixtures/`), place it in a Photo scene, reload, delete
     project → asset gone. Use `setInputFiles` for import.

## Things to keep in mind

- Revoke object URLs; free `ImageBitmap`s (`close()`) when evicted.
- Large files: never read a whole video into memory; stream to OPFS.
- Request persistent storage the first time media is imported (System page already has the helper
  in `lib/storage.ts`).
- EXIF/GPS: not embedded in canvas output, but note it for the future project-bundle export.
- Undo: placing/clearing media in a field is a normal `setSceneField` (undoable). Importing or
  deleting an asset is **not** part of project undo history (**open:** confirm with user).
- Consider a quick M5 spike (render N frames in a worker → MP4 with Mediabunny) during M4 to
  de-risk export early.
