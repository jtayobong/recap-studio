# Next up: M4, media

**Goal:** import photos and video clips into local storage, show them in a media library, and use
them in a new Photo/Video scene template with fit and crop, visible in the live preview.

**Done when:** a user can drop a photo and a clip into the editor, put each into a scene, see them
in the preview and thumbnails, reload and still have them, and delete a project without leaving
orphaned files. `npm run check` and `npm run test:e2e` pass.

These are design notes from the planning so far, not final decisions. Confirm anything marked
**open** with the user before building it.

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
