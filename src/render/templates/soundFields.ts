import { DUCK_LEVEL } from '../../domain/music';
import type { BooleanField, NumberField } from '../fields';

/** Template field that turns a scene's clip sound on (a `boolean`, default off). */
export const CLIP_SOUND_FIELD = 'clipSound';
/** How loud the music is under the scene's clip sound, in percent (M10). */
export const MUSIC_UNDER_CLIP_FIELD = 'musicUnderClip';
/** How loud the scene's clips are, in percent (M10). */
export const CLIP_VOLUME_FIELD = 'clipVolume';

const whenClipSound = { field: CLIP_SOUND_FIELD, filled: true } as const;

/**
 * The sound fields of every template that can show video clips (Photo / Video, Photo grid,
 * Carousel). The two levels only show while "Keep clip sound" is on; their defaults are the sound
 * before M10 (music at 30 % under clips, clips at full volume), so older scenes sound the same.
 */
export const clipSoundFields: {
  clipSound: BooleanField;
  musicUnderClip: NumberField;
  clipVolume: NumberField;
} = {
  [CLIP_SOUND_FIELD]: { kind: 'boolean', label: 'Keep clip sound', default: false },
  [MUSIC_UNDER_CLIP_FIELD]: {
    kind: 'number',
    label: 'Music under the clip (%)',
    default: Math.round(DUCK_LEVEL * 100),
    min: 0,
    max: 100,
    step: 1,
    visibleWhen: whenClipSound,
  },
  [CLIP_VOLUME_FIELD]: { kind: 'number', label: 'Clip volume (%)', default: 100, min: 0, max: 100, step: 1, visibleWhen: whenClipSound },
};
