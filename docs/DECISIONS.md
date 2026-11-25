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
