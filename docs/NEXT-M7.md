# Next up: M7, template pack and style

**Goal:** make a good-looking story easy: more scene templates, more palettes and font pairs, more
transitions, and starter stories to begin from.

**Done when:** a new user can pick a starter story, swap in their own numbers, photos and music,
and export something that looks finished without touching layout; every new template and
transition is drawn by the same renderer in preview and export (covered by the "every registered
template" test and an export frame comparison). `npm run check` and `npm run test:e2e` pass.

These are notes, not final decisions. Confirm anything marked **open** with the user before building.

## What M1–M6 leave in place

- **Templates** are `defineTemplate({ id, name, fields, render, posterMs, … })` in
  `src/render/templates/`, registered in `registry.ts`. Field kinds: `text`, `number`, `boolean`,
  `choice`, `media` (with optional focus point). The inspector form is generated from the fields,
  and `render.test.ts` draws every registered template at many times, in every palette, with and
  without media. Templates must stay pure (CLAUDE.md invariant 4).
- **Media in templates:** `frame.media.frame(assetId, clipMs)` plus `drawMedia` (cover/contain,
  focus, zoom). Export decodes exactly what each frame asks for, so new templates with media need
  no export work.
- **Style:** 4 palettes and 1 font pair in `domain/stylePresets.ts` (system font stacks).
- **Transitions:** `cut`, `fade`, `slide` (`TransitionSchema`, drawn in `renderFrame.ts`).
- **Starter story:** `createStarterScenes()` = Title + Big Number, added by "Add starter scenes".
- **Music:** one track per story, already in preview and export.

## Suggested breakdown

1. **New templates** (**open:** which): e.g. *Top 5* (ranked list, items animate in), *Compare*
   (two stats side by side or before/after), *Outro* (closing card / "see you next year"),
   *Quote / text card*, *Photo grid* (2–4 photos, uses `media` fields + `drawMedia`).
2. **Style presets:** more palettes (**open:** how many) and font pairs. Real font pairs need
   self-hosted font files (**open:** which fonts; must be OFL or similar, files in `public/fonts/`,
   loaded with explicit `FontFace.load()` in the page *and* the export worker, never
   `self.fonts.ready`; see CLAUDE.md known gaps). The fonts e2e test then guards preview = export.
3. **Transitions** (**open:** which): e.g. zoom, wipe, push left, flash. Adding values to
   `TransitionSchema` is a schema change: bump to v3 so an older app shows "made with a newer
   version" instead of "invalid data" (no data migration needed; old values stay valid).
4. **Starter stories** (**open:** how many, what): a picker in the empty-project state instead of
   the single "Add starter scenes" button, e.g. "Music year", "Travel year", "Fitness year", each a
   sequence of templates with placeholder text and empty media slots.
5. **Tests:** template-specific unit tests (like Big Number's count-up), the render-every-template
   test picks new templates up automatically, an export frame comparison for a story using each
   new template and transition, and e2e for the starter picker.

## Open questions for the user

- Which new templates, in what priority?
- How many palettes, and do you want self-hosted fonts (and which), or stay with system fonts?
- Which transitions?
- Which starter stories?
- Should a video clip's own sound be usable (e.g. a "keep clip sound" toggle, mixed under the
  music)? Today clips are always silent (see CLAUDE.md known gaps); this could fit M7 or M8.
