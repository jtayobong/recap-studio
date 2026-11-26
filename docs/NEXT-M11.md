# M11, background motion, text scene, strip fixes: ✅ done (2026-11-26)

**Done-when result:** *Background motion* (Off / Subtle / Lively) is in the project panel; with
Lively, a story of Text, Text (paragraph) and Big Number scenes exports like the preview in 9:16
and 16:9 (`e2e/m11.spec.ts` compares decoded frames with `renderFrame`). Projects from before M11
migrate to Off (v3 fixture test) and the portrait baseline is identical; new projects start on
Subtle. The Text scene renders bullets and paragraphs in both shapes and every palette. Move
earlier / later keeps the moved scene selected and playing in the preview (unit + e2e), and every
strip card has the same height (checked in the editor). `npm run check` (433 unit tests),
`npm run test:e2e` (73) and `npm run test:e2e:prod` (48) pass.

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
- **Move fix done:** `moveSceneTo` selects the moved scene (which moves the playhead to it) when
  the order changed; unit tests in `sceneActions.test.ts`.
- **Uniform cards done:** `.scene-chip__meta` reserves a two-line name row and clamps the name;
  checked in the editor (every chip 112 px in 9:16, 86 px in 16:9).
- **Text scene done:** `render/templates/text.ts`, registered after Section; unit tests in
  `text.test.ts` (bullet reveal order and timing, paragraph wrap, empty body, long text in both
  shapes); checked in the editor in both shapes.
- **Background motion done:** `render/backdrop.ts` (`fillBackground`, `backdropShapes`,
  `motionAmount`), schema v4 with migration, `MotionPicker` in the project panel; every template
  fills its background through it, and Title, Section, Text, Big Number and Outro scale their own
  shapes' movement by `motionAmount`. Decision record D37. Unit tests in `backdrop.test.ts`,
  `migrations.test.ts`, `render.test.ts` (every template with motion on); e2e in `m11.spec.ts`.
