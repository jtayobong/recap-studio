import { defaultAudioTrack, type AudioTrack } from '../domain/project';
import { useEditorStore } from '../store/editorStore';

/**
 * Editor commands for the story's music track. Like scene actions, they go through
 * `useEditorStore.update`, so every change is undoable; continuous controls (sliders) pass a
 * `coalesceKey` so one drag is one undo step.
 */

const update = (recipe: Parameters<ReturnType<typeof useEditorStore.getState>['update']>[0], coalesceKey?: string) =>
  useEditorStore.getState().update(recipe, coalesceKey === undefined ? undefined : { coalesceKey });

/** Use `assetId` as the music. A different song starts from its beginning; volume and fades stay. */
export function setMusic(assetId: string): void {
  update((project) => {
    const current = project.audio;
    if (current?.assetId === assetId) return project;
    const audio: AudioTrack = current ? { ...current, assetId, offsetMs: 0 } : defaultAudioTrack(assetId);
    return { ...project, audio };
  });
}

export function clearMusic(): void {
  update((project) => {
    if (!project.audio) return project;
    const next = { ...project };
    delete next.audio;
    return next;
  });
}

type MusicSettings = Partial<Pick<AudioTrack, 'offsetMs' | 'volume' | 'fadeIn' | 'fadeOut'>>;

/** Change the track's settings. Values are clamped/rounded to what the schema accepts. */
export function updateMusic(settings: MusicSettings, coalesceKey?: string): void {
  update((project) => {
    const current = project.audio;
    if (!current) return project;
    const next: AudioTrack = { ...current };
    if (settings.offsetMs !== undefined) next.offsetMs = Math.max(0, Math.round(settings.offsetMs));
    if (settings.volume !== undefined) next.volume = Math.min(1, Math.max(0, Math.round(settings.volume * 100) / 100));
    if (settings.fadeIn !== undefined) next.fadeIn = settings.fadeIn;
    if (settings.fadeOut !== undefined) next.fadeOut = settings.fadeOut;
    const changed = (Object.keys(next) as (keyof AudioTrack)[]).some((key) => next[key] !== current[key]);
    return changed ? { ...project, audio: next } : project;
  }, coalesceKey);
}
