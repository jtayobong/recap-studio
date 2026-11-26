# M10, text carousel, section divider, ducking controls: in progress (started 2026-11-26)

**Goal:** three additions the user asked for after M9: a carousel of text cards, a scene that
introduces a chapter of the story, and control over how much the music drops under a clip's own
sound.

**Done when:** both new templates are in the gallery, render in 9:16 and 16:9 in every palette, and
export like the preview; a scene with "Keep clip sound" lets the user set the music level under it
and the clip's volume, and the preview and the export follow those settings; existing projects
look and sound exactly as before. `npm run check`, `npm run test:e2e` and `npm run test:e2e:prod`
pass.

**No schema change.** All three are template fields (`scene.fields`, resolved with defaults by
`resolveFields`), so existing projects need no migration and keep their current behaviour.

## Decisions (user, 2026-11-26)

- **Section scene** is a divider *template*, not grouping in the scene strip.
- **Text carousel** cards move *step and pause* (each card slides in and holds so it can be read),
  not a continuous scroll like the photo carousel.
- **Text carousel** cards each have a *headline and an optional smaller line*.
- **Ducking controls** are *per scene* (no project-wide default, so no migration).

## 1. Text carousel (`text-carousel`)

- Fields: `direction` (Horizontal, slides left / Vertical, slides up; same values as the photo
  carousel), optional `title`, and up to 6 cards (`headlineN`, `detailN`). Like the photo
  carousel, the next card's fields appear once the previous card has a headline.
- Cards are coloured blocks (`palette.surface`, headline in `palette.text`, the small line slightly
  dimmed, an accent bar), laid out on the same strip geometry as the photo carousel
  (`carouselCard`), so neighbours peek in at the edges.
- Motion: the scene is divided into equal beats, one per filled card. Within a beat the strip
  holds the card centred, then moves to the next card in the last part of the beat (eased). The
  last card holds to the end. With no cards filled, three sample cards show what the scene does.
- `posterMs` shows the first card settled.

## 2. Section divider (`section`)

- Fields: `label` (e.g. "Part 2"), `title` (e.g. "Summer"), optional `subtitle`.
- A full-frame card: an accent bar that grows across, the label above, a big title below that
  slides up, the subtitle fading in. Portrait centres it in the lower middle; landscape keeps a
  left column, like the Title scene.
- Short by default (2.5 s) since it is a breather between chapters.

## 3. Ducking controls (per scene)

- Every template that can play clip sound (`photo`, `photo-grid`, `carousel`) gets two number
  fields, shown only when "Keep clip sound" is on:
  - `musicUnderClip`, *Music under the clip (%)*, 0–100, default 30 (today's fixed `DUCK_LEVEL`).
  - `clipVolume`, *Clip volume (%)*, 0–100, default 100 (today's level).
- `render/clipSound.ts` puts both on each `SoundSegment` (`duckLevel`, `volume`, 0–1).
  `domain/music.ts` `duckGain` ducks to each segment's own level (the deepest when two overlap);
  the export mix multiplies each clip by its volume; the preview sets each `<video>` element's
  volume. Preview and export keep using the same segments, so they stay in step.
- Defaults reproduce today's sound exactly: 30 % music, clip at full volume.

## Progress

- Design record written (this file).
- **Text carousel done:** `render/templates/textCarousel.ts` (`textCarouselPosition` for the
  step-and-pause motion, `textCarouselCards` for the strip), registered after the photo carousel.
  Upward strips show the page dots in a column at the right edge, since the strip runs past the
  bottom. Unit tests in `textCarousel.test.ts`; `render.test.ts` covers it in every palette and its
  landscape check now runs over every registered template. Portrait baseline unchanged.
- **Section done:** `render/templates/section.ts`, registered right after Title. Unit tests in
  `section.test.ts`; e2e for both new templates in `e2e/m10-templates.spec.ts`.
