import type { Scene } from '../../domain/project';
import { newId } from '../../lib/ids';
import { defaultFields } from '../fields';
import { bigNumberTemplate } from './bigNumber';
import { carouselTemplate } from './carousel';
import { compareTemplate } from './compare';
import { encoreTemplate } from './encore';
import { outroTemplate } from './outro';
import { photoTemplate } from './photo';
import { photoGridTemplate } from './photoGrid';
import { sectionTemplate } from './section';
import { textTemplate } from './text';
import { textCarouselTemplate } from './textCarousel';
import { topListTemplate } from './topList';
import { titleTemplate } from './title';
import type { SceneTemplate } from './types';

/** All scene templates, in the order the editor offers them. Add new templates here. */
export const TEMPLATES: readonly SceneTemplate[] = [
  titleTemplate,
  sectionTemplate,
  textTemplate,
  bigNumberTemplate,
  topListTemplate,
  compareTemplate,
  photoTemplate,
  photoGridTemplate,
  carouselTemplate,
  textCarouselTemplate,
  encoreTemplate,
  outroTemplate,
];

const byId = new Map(TEMPLATES.map((template) => [template.id, template]));

export function getTemplate(id: string): SceneTemplate | undefined {
  return byId.get(id);
}

export function createScene(templateId: string, id: string = newId()): Scene {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`Unknown scene template "${templateId}".`);
  return {
    id,
    templateId: template.id,
    durationMs: template.defaultDurationMs,
    fields: defaultFields(template.fields),
    transitionIn: template.defaultTransition,
  };
}

/** Scene-local poster time, never past the end of the scene. */
export function posterTimeMs(scene: Scene): number {
  const template = getTemplate(scene.templateId);
  return Math.min(template?.posterMs ?? 0, Math.max(0, scene.durationMs - 1));
}

/** The story a new user starts from: an opening title, then a headline stat. */
export function createStarterScenes(): Scene[] {
  return [createScene(titleTemplate.id), createScene(bigNumberTemplate.id)];
}
