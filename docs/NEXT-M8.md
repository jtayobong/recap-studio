# Next up: M8, hardening

**Goal:** a fresh user can go from start to export with no dead ends: clear errors, safe limits,
recoverable failures, and the rough edges collected in M4–M7 smoothed out.

**Done when:** the happy path (new project → starter story → own media and music → export →
download) and the main failure paths (storage full, missing files, unsupported files, unsupported
browser, cancelled export) each have an e2e test and a clear, actionable message; the items marked
for M8 below are done or consciously dropped. `npm run check` and `npm run test:e2e` pass.

These are notes, not final decisions. Confirm anything marked **open** with the user before building.

## Collected for M8 (from earlier milestones)

- **Clip sound** (M7 decision): a "Keep clip sound" toggle on scenes with a video clip, mixed under
  the music (with ducking?) in preview and export. Needs a schema field (v4) and audio mixing of
  clip tracks in the worker.
- **Export speed with media**: ~45–50 fps with full-size photos/clips (30 s ≈ 17–20 s). Profile
  first; likely candidates are high-quality `drawImage` of large bitmaps every frame (pre-scale to
  output size once) and video decode.
- **Leaving the editor discards a finished, undownloaded export** without warning.
- **Inspector noise**: the Photo grid shows all 4 slots and the carousel all 6, even when the layout
  uses fewer; a field-descriptor `visibleWhen` (plain data) would hide unused ones.
- **Storage**: quota warnings before it's full (System page already estimates usage), and a way to
  see/clean large media.
- **Project bundle export/import** (backup or move to another machine): zip of the project JSON +
  media; strip EXIF/GPS from photos kept byte-for-byte; validate everything on import (Zod,
  unknown templates, size caps / zip bombs).
- **Bundle size**: main chunk ~560 kB; route-level code splitting.
- **CSP review** and an e2e run of the main flows against `vite preview` in CI.
- **Fonts** differ slightly between operating systems (system font stacks); self-hosted fonts were
  declined for M7 (open: revisit?).

## Open questions for the user

- Which of the items above are in scope for M8, and in what order?
- Clip sound: just a toggle, or also a per-clip volume; should the music duck under it?
- Project bundles: needed now (backup / moving machines), or later?
- Is there anything you've noticed while using the app that should go first?
