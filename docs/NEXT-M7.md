# Next up: M7, template pack and style

**Goal:** make a good-looking story easy: more scene templates, more palettes and font pairs, more
transitions, and starter stories to begin from.

**Done when:** a new user can pick a starter story, swap in their own numbers, photos and music,
and export something that looks finished without touching layout; every new template and
transition is drawn by the same renderer in preview and export (covered by the "every registered
template" test and an export frame comparison). `npm run check` and `npm run test:e2e` pass.

Design notes; the open questions are settled (see **Decisions** at the end).

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

## Progress

- **Step 1 done (2026-11-25): Top 5, Compare, Outro** (`topList.ts`, `compare.ts`, `outro.ts`).
  Top 5 skips empty items and keeps ranks; Compare counts both up, scales the bars to the larger
  value, emphasises it and shows the % change (`percentChange`, en-US); Outro rings + title,
  optional fade to the background over the last 0.9 s. Checked on a contact sheet across palettes.
- **Step 2 done (2026-11-25): Photo grid and Photo carousel** (`photoGrid.ts`, `carousel.ts`,
  shared geometry and placeholder in `mediaLayout.ts`). Grid: layouts 2 stacked / 1 big + 2 /
  2 × 2, per-slot media, focus point and fit, cells pop in and drift. Carousel: up to 6 slots
  (filled ones in order; three placeholders when empty) on a strip that scrolls continuously from
  the first card centred to the last, left or up. `MediaField.focus.aspect` lets the focus picker
  outline the real cell/card shape per layout/direction.

## Suggested breakdown

1. **New templates**: Top 5, Compare, Outro, Photo grid, Photo carousel (see Decisions). Grid and
   carousel use several `media` fields + `drawMedia`; the export needs no changes for them.
2. **Style presets:** ~6 more palettes and 2 more system-font pairs in `domain/stylePresets.ts`
   (the fonts e2e test covers every font pair automatically).
3. **Transitions:** zoom, wipe, push left, flash, drawn in `renderFrame.ts`; schema v3 so an
   older app shows "made with a newer version" instead of "invalid data".
4. **Starter stories:** a picker in the empty-project state with three themed starters.
5. **Tests:** template-specific unit tests (like Big Number's count-up), the render-every-template
   test picks new templates up automatically, an export frame comparison for a story using each
   new template and transition, and e2e for the starter picker.

## Decisions (confirmed with the user, 2026-11-25)

- **Templates**, built in this order:
  1. *Top 5 list*: ranked items that animate in one by one.
  2. *Compare*: two stats side by side / before → after, the bigger one emphasised.
  3. *Outro*: closing card with a gentle end animation.
  4. *Photo grid*: 2–4 photos or clips, each with its own media slot, focus point and fit.
  5. *Photo carousel* (added by the user): up to 6 photos/clips in a strip that **scrolls
     continuously** across the screen during the scene; one template with a **Direction** setting,
     vertical (up) or horizontal (left).
- **Style:** about 6 more palettes (10 in total) and 2 more font pairs, **system fonts only**
  (no font files to ship or license).
- **Transitions:** all four: *Zoom*, *Wipe* (accent-coloured diagonal band), *Push left*, *Flash*.
  New `TransitionSchema` values → **schema v3** (no data migration; old values stay valid).
- **Starter stories:** a picker with **3 themed starters** ("Music year", "Travel year", "Fitness
  year"), 6–8 scenes each with placeholder text and empty media slots; it replaces the single
  "Add starter scenes" button.
- **Clip sound:** not in M7; revisit in **M8** as a "keep clip sound" toggle mixed under the music.
