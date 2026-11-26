# M11, background motion, text scene, strip fixes: in progress

**Goal:** four additions the user asked for after M10: livelier backgrounds, a text-only scene
(like a "Title and Content" slide), and two editor fixes: the move buttons lose the moved scene
in the preview, and scene cards in the strip have uneven heights.

**Done when:** a story setting *Background motion* (Off / Subtle / Lively) adds drifting shapes
behind every template in the preview and the export, in 9:16 and 16:9; existing projects migrate
to Off and look exactly as before (portrait baseline unchanged); new projects start on Subtle.
The Text scene renders a title with bullets (revealed one by one) or a paragraph, in both shapes
and every palette. After Move earlier / later (and drag or Alt+←/→) the preview shows the moved
scene. Every scene card in the strip has the same height. `npm run check`, `npm run test:e2e` and
`npm run test:e2e:prod` pass.

## Decisions (user, 2026-11-26)

- **Background motion** is one setting for the whole story, next to palette and fonts, with
  three levels. Existing projects keep their look (Off); new projects start on Subtle.
- **Text scene** has a title and a body with a *Bullets / Paragraph* switch.

## 1. Move buttons follow the scene

`moveSceneTo` reordered the scenes but left the playhead where it was, so the preview showed
whichever scene now sits at that time. Moving a scene now selects it and moves the playhead to its
poster time at the new position (same as clicking it). Buttons, drag-and-drop and Alt+←/→ all use
`moveSceneTo`.

## 2. Uniform scene cards

A long template name ("Photo carousel", "Photo / Video") wrapped and made its card taller. Cards
get a fixed height; names are clamped to two lines (full name in a tooltip and the accessible
name).

## 3. Text scene (`text`)

- Fields: `title`, `layout` (Bullets / Paragraph), `body` (multiline; in Bullets each non-empty
  line is a bullet).
- Title at the top with an accent bar; bullets appear one after another; a paragraph fades in as a
  block. Text is fitted to the space (`fitText`), in both shapes.

## 4. Background motion (story setting, schema v→v+1)

- `project.style.backgroundMotion`: `'off' | 'subtle' | 'lively'`. Migration sets `'off'` for
  existing projects; `createProject` defaults to `'subtle'`.
- `render/backdrop.ts` draws a deterministic layer of drifting shapes (circles, rings, dots) in
  palette colours, seeded per scene, positioned with `unitOf`/`isLandscape`. `renderFrame` passes
  the level to templates through the render context; templates call it right after their
  background fill, so it sits behind the template's own shapes and text. Off draws nothing.
- Picker in the project panel next to palette and fonts.

## Progress

- Design record written (this file).
