import type { Scene, Transition } from '../../domain/project';
import { createScene } from './registry';

/**
 * Starter stories: ready-made sequences of scenes with placeholder text and empty media slots.
 * Users swap in their own numbers, photos and music. Wording stays generic and original.
 */
export interface StarterStory {
  id: string;
  name: string;
  description: string;
  scenes: () => Scene[];
}

interface SceneSpec {
  template: string;
  durationMs?: number;
  transition?: Transition;
  fields?: Record<string, unknown>;
}

function build(specs: SceneSpec[]): Scene[] {
  return specs.map((spec) => {
    const scene = createScene(spec.template);
    return {
      ...scene,
      durationMs: spec.durationMs ?? scene.durationMs,
      transitionIn: spec.transition ?? scene.transitionIn,
      fields: { ...scene.fields, ...spec.fields },
    };
  });
}

export const STARTER_STORIES: readonly StarterStory[] = [
  {
    id: 'music-year',
    name: 'Music year',
    description: 'Listening stats, top artists and your best concert.',
    scenes: () =>
      build([
        { template: 'title', fields: { kicker: 'Your year, replayed', title: 'My 2026\nin music', subtitle: 'Press play on the highlights.' } },
        { template: 'big-number', transition: 'push', fields: { label: 'You listened for', value: 48213, unit: 'minutes', caption: 'That’s more than 33 days of music.' } },
        { template: 'top-list', transition: 'wipe', fields: { title: 'Your top 5 artists' } },
        {
          template: 'top-list',
          transition: 'push',
          fields: { title: 'Songs on repeat', item1: 'Golden Hour Drive', item2: 'Static Hearts', item3: 'Low Tide', item4: 'Paper Planes at Night', item5: 'Afterglow' },
        },
        { template: 'compare', transition: 'zoom', fields: { title: 'Hours of music', leftLabel: '2025', leftValue: 610, rightLabel: '2026', rightValue: 803, unit: 'hours' } },
        { template: 'photo', transition: 'flash', fields: { caption: 'Best night: front row, singing along' } },
        { template: 'outro', transition: 'fade', fields: { title: 'Turn it up\nnext year', message: 'Thanks for listening along.' } },
      ]),
  },
  {
    id: 'travel-year',
    name: 'Travel year',
    description: 'Distance covered, favourite places and a photo carousel.',
    scenes: () =>
      build([
        { template: 'title', fields: { kicker: 'Passport stamps', title: 'My 2026\nin travel', subtitle: 'Every road, runway and ferry.' } },
        { template: 'big-number', transition: 'push', fields: { label: 'You travelled', value: 24860, unit: 'km', caption: 'More than halfway around the world.' } },
        { template: 'carousel', transition: 'fade', durationMs: 6000, fields: { title: 'Moments from the road', direction: 'left' } },
        {
          template: 'top-list',
          transition: 'wipe',
          fields: { title: 'Favourite places', item1: 'Lisbon', item2: 'Kyoto', item3: 'Cape Town', item4: 'Oslo', item5: 'Oaxaca' },
        },
        { template: 'compare', transition: 'zoom', fields: { title: 'Countries visited', leftLabel: '2025', leftValue: 3, rightLabel: '2026', rightValue: 7, unit: 'countries' } },
        { template: 'photo-grid', transition: 'push', fields: { layout: 'three', caption: 'Best views of the year' } },
        { template: 'outro', transition: 'fade', fields: { title: 'Where to\nnext?', message: 'Thanks for coming along for the ride.' } },
      ]),
  },
  {
    id: 'fitness-year',
    name: 'Fitness year',
    description: 'Kilometres, workouts and your proudest finish.',
    scenes: () =>
      build([
        { template: 'title', fields: { kicker: 'Sweat, replayed', title: 'My 2026\nin motion', subtitle: 'Every early alarm was worth it.' } },
        { template: 'big-number', transition: 'push', fields: { label: 'You ran', value: 1240, unit: 'km', caption: 'About 30 marathons, one step at a time.' } },
        { template: 'compare', transition: 'wipe', fields: { title: 'Workouts', leftLabel: '2025', leftValue: 118, rightLabel: '2026', rightValue: 176, unit: 'workouts' } },
        {
          template: 'top-list',
          transition: 'push',
          fields: { title: 'Favourite workouts', item1: 'Long Sunday run', item2: 'Hill repeats', item3: 'Yoga flow', item4: 'Spin class', item5: 'Open-water swim' },
        },
        { template: 'photo', transition: 'flash', fields: { caption: 'Proudest finish line', motion: 'zoom-in' } },
        { template: 'big-number', transition: 'zoom', fields: { label: 'You trained for', value: 212, unit: 'hours', caption: 'Consistency beat intensity.' } },
        { template: 'outro', transition: 'fade', fields: { title: 'Same time\nnext year', message: 'Rest day earned.' } },
      ]),
  },
];

export function getStarterStory(id: string): StarterStory | undefined {
  return STARTER_STORIES.find((story) => story.id === id);
}
