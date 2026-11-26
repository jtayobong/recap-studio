import { describe, expect, it, vi } from 'vitest';
import type { BackgroundMotion, Scene } from '../domain/project';
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, easeOutExpo, lerp, progress, seededRandom } from './easing';
import { defaultFields, fieldsEditedBySlots, resolveFields, type FieldDefs } from './fields';
import { getPalette, PALETTES } from '../domain/stylePresets';
import { NO_MEDIA, type MediaResolver } from './media';
import { renderFrame, type RenderableProject } from './renderFrame';
import { kenBurnsZoom, KEN_BURNS_MAX_ZOOM } from './templates/photo';
import { createScene, createStarterScenes, getTemplate, posterTimeMs, TEMPLATES } from './templates/registry';
import { isLandscape, unitOf } from './layout';
import { createMockContext } from './testing/mockContext';
import { fitText, wrapLines } from './text';
import {
  activeTransition,
  formatTimecode,
  frameToMs,
  getSceneSpans,
  locateScene,
  msToFrame,
  totalDurationMs,
  TRANSITION_MS,
} from './timeline';

const scene = (id: string, durationMs: number, overrides: Partial<Scene> = {}): Scene => ({
  id,
  templateId: 'title',
  durationMs,
  fields: {},
  transitionIn: 'cut',
  ...overrides,
});

const MEDIA_ID = '0b8f3c5e-6a43-4c0e-9d0b-2f7f7d1f0a11';

/** Every media field of a template points at MEDIA_ID. */
function mediaFieldsFor(templateId: string): Record<string, string> {
  const template = getTemplate(templateId)!;
  return Object.fromEntries(
    Object.entries(template.fields)
      .filter(([, def]) => def.kind === 'media')
      .map(([key]) => [key, MEDIA_ID]),
  );
}

/** Answers with a 4:3 image for MEDIA_ID. */
const fakeMedia: MediaResolver = {
  frame: (id) => (id === MEDIA_ID ? { source: {} as CanvasImageSource, width: 4000, height: 3000, kind: 'image' } : undefined),
};

const testTheme = {
  palette: { background: '#000', surface: '#111', primary: '#f0f', accent: '#0f0', text: '#fff', id: 'x', name: 'x' },
  fonts: { id: 'f', name: 'f', display: 'sans-serif', body: 'sans-serif' },
};

const PORTRAIT: RenderableProject['format'] = { width: 1080, height: 1920, fps: 30 };
const LANDSCAPE: RenderableProject['format'] = { width: 1920, height: 1080, fps: 30 };

const project = (scenes: Scene[], paletteId = 'neon-pulse', format = PORTRAIT, backgroundMotion: BackgroundMotion = 'off'): RenderableProject => ({
  format,
  style: { paletteId, fontPairId: 'heavy-grotesk', backgroundMotion },
  scenes,
});

describe('easing', () => {
  it('starts at 0 and ends at 1', () => {
    for (const ease of [easeOutCubic, easeInOutCubic, easeOutExpo, easeOutBack]) {
      expect(ease(0)).toBeCloseTo(0);
      expect(ease(1)).toBeCloseTo(1);
    }
  });

  it('clamps input outside 0…1', () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
    expect(clamp01(5)).toBe(1);
  });

  it('easeOutBack overshoots before settling', () => {
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map(easeOutBack))).toBeGreaterThan(1);
  });

  it('computes progress windows', () => {
    expect(progress(0, 100, 200)).toBe(0);
    expect(progress(200, 100, 200)).toBe(0.5);
    expect(progress(900, 100, 200)).toBe(1);
    expect(progress(100, 100, 0)).toBe(1);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it('seededRandom is deterministic and in range', () => {
    expect(seededRandom(42)).toBe(seededRandom(42));
    expect(seededRandom(1)).not.toBe(seededRandom(2));
    for (let i = 0; i < 100; i += 1) {
      const r = seededRandom(i);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
});

describe('timeline', () => {
  const spans = getSceneSpans([scene('a', 3000), scene('b', 2000), scene('c', 1000)]);

  it('lays scenes end to end', () => {
    expect(spans.map((s) => [s.startMs, s.endMs])).toEqual([
      [0, 3000],
      [3000, 5000],
      [5000, 6000],
    ]);
    expect(totalDurationMs(spans)).toBe(6000);
    expect(totalDurationMs([])).toBe(0);
  });

  it('locates the scene under the playhead', () => {
    expect(locateScene(spans, 0)).toMatchObject({ span: { index: 0 }, localMs: 0 });
    expect(locateScene(spans, 2999)).toMatchObject({ span: { index: 0 }, localMs: 2999 });
    expect(locateScene(spans, 3000)).toMatchObject({ span: { index: 1 }, localMs: 0 });
    expect(locateScene(spans, 5500)).toMatchObject({ span: { index: 2 }, localMs: 500 });
  });

  it('clamps outside the story and shows the last frame at the end', () => {
    expect(locateScene(spans, -50)).toMatchObject({ span: { index: 0 }, localMs: 0 });
    expect(locateScene(spans, 6000)).toMatchObject({ span: { index: 2 }, localMs: 1000 });
    expect(locateScene(spans, 99_999)).toMatchObject({ span: { index: 2 }, localMs: 1000 });
    expect(locateScene([], 100)).toBeNull();
  });

  it('reports entrance transitions, capped at half the scene', () => {
    const [fade] = getSceneSpans([scene('f', 4000, { transitionIn: 'fade' })]);
    expect(activeTransition({ span: fade!, localMs: TRANSITION_MS / 2 })).toEqual({ kind: 'fade', progress: 0.5 });
    expect(activeTransition({ span: fade!, localMs: TRANSITION_MS })).toBeNull();

    const [short] = getSceneSpans([scene('s', 400, { transitionIn: 'slide' })]);
    expect(activeTransition({ span: short!, localMs: 100 })).toEqual({ kind: 'slide', progress: 0.5 });

    const [cut] = getSceneSpans([scene('c', 4000)]);
    expect(activeTransition({ span: cut!, localMs: 0 })).toBeNull();
  });

  it('converts frames and formats timecodes', () => {
    expect(msToFrame(1000, 30)).toBe(30);
    expect(msToFrame(frameToMs(7, 30), 30)).toBe(7);
    expect(formatTimecode(0)).toBe('0:00.0');
    expect(formatTimecode(3250)).toBe('0:03.2');
    expect(formatTimecode(65_000)).toBe('1:05.0');
  });
});

describe('fields', () => {
  const defs = {
    title: { kind: 'text', label: 'Title', default: 'Hi', maxLength: 5 },
    body: { kind: 'text', label: 'Body', default: '', maxLength: 50, multiline: true },
    count: { kind: 'number', label: 'Count', default: 3, min: 0, max: 10, step: 1 },
    ratio: { kind: 'number', label: 'Ratio', default: 0.5, min: 0, max: 1, step: 0.1 },
    on: { kind: 'boolean', label: 'On', default: true },
    mode: {
      kind: 'choice',
      label: 'Mode',
      default: 'a',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    },
  } satisfies FieldDefs;

  it('fills in defaults', () => {
    expect(defaultFields(defs)).toEqual({ title: 'Hi', body: '', count: 3, ratio: 0.5, on: true, mode: 'a' });
  });

  it('coerces and clamps stored values', () => {
    const values = resolveFields(defs, {
      title: 'Way too long',
      body: 'line 1\r\nline 2',
      count: 99,
      ratio: 0.333,
      on: 'yes',
      mode: 'b',
      extra: 'dropped',
    });
    expect(values).toEqual({ title: 'Way t', body: 'line 1\nline 2', count: 10, ratio: 0.3, on: true, mode: 'b' });
    expect('extra' in values).toBe(false);
  });

  it('rejects wrong types and invalid choices', () => {
    expect(resolveFields(defs, { title: 42, count: Number.NaN, mode: 'z' })).toMatchObject({
      title: 'Hi',
      count: 3,
      mode: 'a',
    });
  });

  it('flattens newlines in single-line text', () => {
    expect(resolveFields(defs, { title: 'a\nb' }).title).toBe('a b');
  });

  it('lists the fields that media slots edit themselves', () => {
    expect(fieldsEditedBySlots(getTemplate('photo')!.fields)).toEqual(new Set(['focusX', 'focusY']));
    expect(fieldsEditedBySlots(getTemplate('title')!.fields)).toEqual(new Set());
  });

  it('keeps media slots as a well-formed asset id or empty', () => {
    const media = { photo: { kind: 'media', label: 'Photo', default: '', accept: ['image'] } } satisfies FieldDefs;
    expect(defaultFields(media)).toEqual({ photo: '' });
    const id = '0b8f3c5e-6a43-4c0e-9d0b-2f7f7d1f0a11';
    expect(resolveFields(media, { photo: id }).photo).toBe(id);
    for (const bad of [42, null, '../assets/x', 'a b', 'x'.repeat(65)]) {
      expect(resolveFields(media, { photo: bad }).photo).toBe('');
    }
  });
});

describe('text layout', () => {
  const font = { family: 'sans-serif', weight: 400 };

  it('wraps words and keeps explicit newlines', () => {
    const { ctx } = createMockContext();
    // Mock width = chars × size × 0.6 → at 10px each char is 6px.
    expect(wrapLines(ctx, 'aaa bbb ccc', font, 10, 45)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapLines(ctx, 'one\ntwo', font, 10, 1000)).toEqual(['one', 'two']);
  });

  it('shrinks text until it fits', () => {
    const { ctx } = createMockContext();
    const fitted = fitText(ctx, 'HELLO', {
      font,
      maxWidth: 100,
      maxHeight: 1000,
      maxSize: 100,
      minSize: 5,
      lineHeight: 1,
    });
    expect(5 * fitted.sizePx * 0.6).toBeLessThanOrEqual(100);
    expect(fitted.sizePx).toBeGreaterThan(25);
  });

  it('never goes below the minimum size', () => {
    const { ctx } = createMockContext();
    const fitted = fitText(ctx, 'x'.repeat(500), {
      font,
      maxWidth: 10,
      maxHeight: 10,
      maxSize: 50,
      minSize: 8,
      lineHeight: 1,
    });
    expect(fitted.sizePx).toBe(8);
  });
});

describe('templates', () => {
  it('have unique ids and valid defaults', () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const template of TEMPLATES) {
      expect(template.defaultDurationMs).toBeGreaterThanOrEqual(1000);
      const created = createScene(template.id, 'x');
      expect(created).toMatchObject({ id: 'x', templateId: template.id, durationMs: template.defaultDurationMs });
    }
  });

  it('createScene rejects unknown templates', () => {
    expect(() => createScene('nope')).toThrow(/Unknown scene template/);
  });

  it('starter story is a title then a big number', () => {
    expect(createStarterScenes().map((s) => s.templateId)).toEqual(['title', 'big-number']);
  });

  it('photo draws its media when the resolver has it, a placeholder otherwise', () => {
    const template = getTemplate('photo')!;
    const draw = (media: MediaResolver, fields: Record<string, unknown>) => {
      const mock = createMockContext();
      template.draw(mock.ctx, { width: 1080, height: 1920, localMs: 2000, durationMs: 4000, media }, fields, testTheme);
      return { images: mock.calls.filter((c) => c.method === 'drawImage').length, texts: mock.texts() };
    };
    expect(draw(fakeMedia, { media: MEDIA_ID, caption: 'Hi' })).toEqual({ images: 1, texts: ['Hi'] });
    expect(draw(fakeMedia, { media: MEDIA_ID, fit: 'contain', caption: '' }).images).toBe(2);
    expect(draw(NO_MEDIA, { media: MEDIA_ID, caption: '' }).texts).toEqual(['Add a photo or clip']);
    expect(draw(fakeMedia, { media: '', caption: '' }).texts).toEqual(['Add a photo or clip']);
    const audio: MediaResolver = { frame: () => ({ source: {} as CanvasImageSource, width: 1, height: 1, kind: 'audio' }) };
    expect(draw(audio, { media: MEDIA_ID, caption: '' }).images).toBe(0);
  });

  it('photo crops around the focus point', () => {
    const template = getTemplate('photo')!;
    const sourceX = (focusX: number) => {
      const mock = createMockContext();
      template.draw(mock.ctx, { width: 1080, height: 1920, localMs: 0, durationMs: 4000, media: fakeMedia }, { media: MEDIA_ID, focusX, motion: 'none' }, testTheme);
      return Number(mock.calls.find((c) => c.method === 'drawImage')?.args[1]);
    };
    expect(sourceX(0)).toBe(0);
    expect(sourceX(0.5)).toBeGreaterThan(sourceX(0));
    expect(sourceX(1)).toBeGreaterThan(sourceX(0.5));
  });

  it('Ken Burns zooms smoothly over the whole scene, in either direction', () => {
    expect(kenBurnsZoom('zoom-in', 0, 4000)).toBe(1);
    expect(kenBurnsZoom('zoom-in', 4000, 4000)).toBeCloseTo(KEN_BURNS_MAX_ZOOM);
    expect(kenBurnsZoom('zoom-out', 0, 4000)).toBeCloseTo(KEN_BURNS_MAX_ZOOM);
    expect(kenBurnsZoom('zoom-out', 4000, 4000)).toBe(1);
    expect(kenBurnsZoom('none', 2000, 4000)).toBe(1);
    let previous = 0;
    for (let t = 0; t <= 4000; t += 100) {
      const zoom = kenBurnsZoom('zoom-in', t, 4000);
      expect(zoom).toBeGreaterThanOrEqual(previous);
      previous = zoom;
    }
  });

  it('photo asks the resolver for the scene-local time (clip time)', () => {
    const template = getTemplate('photo')!;
    const seen: number[] = [];
    const media: MediaResolver = {
      frame: (_id, ms) => {
        seen.push(ms);
        return undefined;
      },
    };
    template.draw(createMockContext().ctx, { width: 1080, height: 1920, localMs: 1234, durationMs: 4000, media }, { media: MEDIA_ID }, testTheme);
    expect(seen).toEqual([1234]);
  });

  it('big number counts up from zero to the final value', () => {
    const template = getTemplate('big-number')!;
    const theme = { palette: { background: '#000', surface: '#111', primary: '#f0f', accent: '#0f0', text: '#fff', id: 'x', name: 'x' }, fonts: { id: 'f', name: 'f', display: 'sans-serif', body: 'sans-serif' } };
    const drawAt = (localMs: number) => {
      const { ctx, texts } = createMockContext();
      template.draw(ctx, { width: 1080, height: 1920, localMs, durationMs: 5000, media: NO_MEDIA }, { value: 1234 }, theme);
      return texts();
    };
    expect(drawAt(250)).toContain('0');
    expect(drawAt(4000)).toContain('1,234');
  });
});

describe('renderFrame', () => {
  const starter = project([scene('t', 3500, { templateId: 'title', transitionIn: 'fade' }), scene('n', 5000, { templateId: 'big-number', transitionIn: 'slide' })]);

  it('is deterministic: the same time draws the same frame', () => {
    for (const t of [0, 400, 1200, 3600, 7000]) {
      const a = createMockContext();
      const b = createMockContext();
      renderFrame(a.ctx, starter, t);
      renderFrame(b.ctx, starter, t);
      expect(a.calls).toEqual(b.calls);
    }
  });

  it('balances every save with a restore', () => {
    for (const t of [0, 3600, 8500]) {
      const { ctx, calls } = createMockContext();
      renderFrame(ctx, starter, t);
      const saves = calls.filter((c) => c.method === 'save').length;
      expect(calls.filter((c) => c.method === 'restore').length).toBe(saves);
    }
  });

  it('draws every registered template at many points in time, in every palette and format, with and without media', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const scenes = TEMPLATES.map((t) => {
      const created = createScene(t.id);
      return { ...created, fields: { ...created.fields, ...mediaFieldsFor(t.id) } };
    });
    const total = scenes.reduce((sum, s) => sum + s.durationMs, 0);
    for (const format of [PORTRAIT, LANDSCAPE]) {
      for (const media of [NO_MEDIA, fakeMedia]) {
        for (const paletteId of PALETTES.map((p) => p.id)) {
          const p = project(scenes, paletteId, format);
          for (let t = 0; t <= total; t += 250) {
            const { ctx, texts, calls } = createMockContext();
            renderFrame(ctx, p, t, media);
            expect(texts().some((text) => text.includes('failed to draw'))).toBe(false);
            expect(calls.filter((c) => c.method === 'save').length).toBe(calls.filter((c) => c.method === 'restore').length);
          }
        }
      }
    }
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('draws every template with background motion on, in both shapes', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const scenes = TEMPLATES.map((t) => {
      const created = createScene(t.id);
      return { ...created, fields: { ...created.fields, ...mediaFieldsFor(t.id) } };
    });
    const total = scenes.reduce((sum, s) => sum + s.durationMs, 0);
    for (const motion of ['subtle', 'lively'] as const) {
      for (const format of [PORTRAIT, LANDSCAPE]) {
        const p = project(scenes, 'mint-riot', format, motion);
        for (let t = 0; t <= total; t += 250) {
          const { ctx, texts, calls } = createMockContext();
          renderFrame(ctx, p, t, fakeMedia);
          expect(texts().some((text) => text.includes('failed to draw'))).toBe(false);
          expect(calls.filter((c) => c.method === 'save').length).toBe(calls.filter((c) => c.method === 'restore').length);
        }
      }
    }
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('draws both scenes during a slide transition', () => {
    const { ctx, texts } = createMockContext();
    renderFrame(ctx, starter, 3500 + TRANSITION_MS / 2);
    const drawn = texts();
    expect(drawn).toContain('Recap'); // outgoing title
    expect(drawn).toContain('You listened for'); // incoming big number
  });

  it('shows a placeholder for an empty story', () => {
    const { ctx, texts } = createMockContext();
    renderFrame(ctx, project([]), 0);
    expect(texts().join(' ')).toMatch(/Add a scene/);
  });

  it('shows a message card for unknown templates instead of throwing', () => {
    const { ctx, texts } = createMockContext();
    renderFrame(ctx, project([scene('u', 2000, { templateId: 'from-the-future' })]), 500);
    expect(texts().join(' ')).toMatch(/Unknown scene type/);
  });

  it('contains a template that throws', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const template = getTemplate('title')!;
    const original = template.draw;
    template.draw = () => {
      throw new Error('boom');
    };
    try {
      const { ctx, texts } = createMockContext();
      expect(() => renderFrame(ctx, project([scene('t', 2000)]), 1000)).not.toThrow();
      expect(texts().join(' ')).toMatch(/Title scene failed to draw/);
    } finally {
      template.draw = original;
      errors.mockRestore();
    }
  });
});

describe('transitions', () => {
  const KINDS = ['fade', 'slide', 'push', 'zoom', 'wipe', 'flash'] as const;
  // Title (3500 ms) then Big Number entering with each kind; mid-transition is 3500 + 450 / 2.
  const story = (kind: (typeof KINDS)[number]) =>
    project([scene('t', 3500, { templateId: 'title' }), scene('n', 5000, { templateId: 'big-number', transitionIn: kind })]);

  it.each(KINDS)('%s: draws both scenes mid-transition, balanced and deterministic', (kind) => {
    const a = createMockContext();
    const b = createMockContext();
    renderFrame(a.ctx, story(kind), 3500 + TRANSITION_MS * 0.3);
    renderFrame(b.ctx, story(kind), 3500 + TRANSITION_MS * 0.3);
    expect(a.calls).toEqual(b.calls);
    expect(a.calls.filter((c) => c.method === 'save').length).toBe(a.calls.filter((c) => c.method === 'restore').length);
    const texts = a.texts();
    if (kind === 'flash') {
      // Flash cuts at its peak: first half shows the outgoing scene only.
      expect(texts).toContain('Recap');
    } else {
      expect(texts).toContain('Recap'); // outgoing title
      expect(texts).toContain('You listened for'); // incoming big number
    }
  });

  it.each(KINDS)('%s: after the transition only the new scene is drawn', (kind) => {
    const mock = createMockContext();
    renderFrame(mock.ctx, story(kind), 3500 + TRANSITION_MS + 50);
    expect(mock.texts()).not.toContain('Recap');
    expect(mock.texts()).toContain('You listened for');
  });

  it('flash peaks white at the cut, from the old scene into the new one', () => {
    const whiteAlpha = (t: number) => {
      const mock = createMockContext();
      renderFrame(mock.ctx, story('flash'), t);
      return mock.calls.filter((c) => c.method === 'fillRect' && c.state.fillStyle === '#ffffff').at(-1)?.state.globalAlpha ?? 0;
    };
    const peak = whiteAlpha(3500 + TRANSITION_MS * 0.49);
    expect(peak).toBeGreaterThan(0.9);
    expect(whiteAlpha(3500 + TRANSITION_MS * 0.1)).toBeLessThan(peak);
    expect(whiteAlpha(3500 + TRANSITION_MS * 0.9)).toBeLessThan(0.2);
    const afterCut = createMockContext();
    renderFrame(afterCut.ctx, story('flash'), 3500 + TRANSITION_MS * 0.6);
    expect(afterCut.texts()).toContain('You listened for');
    expect(afterCut.texts()).not.toContain('Recap');
  });

  it('wipe rides an accent-coloured band on its edge', () => {
    const mock = createMockContext();
    renderFrame(mock.ctx, story('wipe'), 3500 + TRANSITION_MS / 2);
    const accent = getPalette('neon-pulse').accent;
    expect(mock.calls.some((c) => c.method === 'fillRect' && c.state.fillStyle === accent)).toBe(true);
  });

  it('the first scene transitions in from the background with every kind', () => {
    for (const kind of KINDS) {
      const mock = createMockContext();
      renderFrame(mock.ctx, project([scene('t', 3500, { templateId: 'title', transitionIn: kind })]), TRANSITION_MS * 0.6);
      expect(mock.calls.filter((c) => c.method === 'save').length, kind).toBe(mock.calls.filter((c) => c.method === 'restore').length);
    }
  });
});

describe('renderFrame clipping', () => {
  it('clips everything to the frame before drawing, so transitions never paint outside it', () => {
    const { ctx, calls } = createMockContext();
    renderFrame(ctx, project([scene('t', 3500, { transitionIn: 'push' })]), 100);
    const firstClip = calls.findIndex((c) => c.method === 'clip');
    const firstFill = calls.findIndex((c) => c.method === 'fillRect');
    expect(firstClip).toBeGreaterThan(-1);
    expect(firstClip).toBeLessThan(firstFill);
    expect(calls.find((c) => c.method === 'rect')?.args).toEqual([0, 0, 1080, 1920]);
  });
});

describe('layout helpers', () => {
  it('tell the shapes apart and size by the shorter side', () => {
    expect(isLandscape(LANDSCAPE)).toBe(true);
    expect(isLandscape(PORTRAIT)).toBe(false);
    expect(unitOf(LANDSCAPE)).toBe(1080);
    expect(unitOf(PORTRAIT)).toBe(1080);
  });

  it('landscape templates keep their text inside the frame', () => {
    for (const templateId of TEMPLATES.map((t) => t.id)) {
      const created = createScene(templateId);
      const { ctx, calls } = createMockContext();
      renderFrame(ctx, project([{ ...created, transitionIn: 'cut' }], 'neon-pulse', LANDSCAPE), posterTimeMs(created));
      const baselines = calls.filter((c) => c.method === 'fillText').map((c) => Number(c.args[2]));
      expect(baselines.length).toBeGreaterThan(0);
      for (const y of baselines) expect(y).toBeLessThan(1080);
    }
  });
});
