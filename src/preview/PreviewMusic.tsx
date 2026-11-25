import { useEffect, useRef } from 'react';
import { assetRepository } from '../db';
import { projectDurationMs } from '../domain/project';
import { useEditorStore } from '../store/editorStore';
import { syncMusic } from './musicSync';
import { usePlaybackStore } from './playbackStore';

/**
 * Plays the story's music in the preview, following the playhead. Like the preview canvas it is
 * driven from store subscriptions, not React renders: the song is (re)loaded when the track's
 * asset changes, and `syncMusic` runs whenever playback, time or the track settings change.
 * The element is in the DOM (hidden) so it can be inspected in tests and dev tools.
 */
export function PreviewMusic() {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;

    let loadedAssetId: string | null = null;
    let songMs: number | undefined;
    let url: string | null = null;
    let generation = 0;

    const sync = () => {
      const project = useEditorStore.getState().project;
      const { timeMs, playing, muted } = usePlaybackStore.getState();
      const track = project?.audio?.assetId === loadedAssetId ? project?.audio : undefined;
      syncMusic(audio, {
        track,
        songMs,
        storyMs: project ? projectDurationMs(project) : 0,
        timeMs,
        playing,
        muted,
      });
    };

    const unload = () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (url) URL.revokeObjectURL(url);
      url = null;
      songMs = undefined;
      loadedAssetId = null;
    };

    const load = async (assetId: string | undefined) => {
      generation += 1;
      const current = generation;
      unload();
      if (!assetId) return;
      const [asset, file] = await Promise.all([assetRepository.get(assetId), assetRepository.readFile(assetId)]);
      if (current !== generation) return; // the track changed meanwhile
      if (!asset || asset.kind !== 'audio' || !file) return; // missing: stay silent
      url = URL.createObjectURL(file);
      loadedAssetId = assetId;
      audio.src = url;
    };

    // The song is playable once metadata is in; prefer the element's own duration.
    const onReady = () => {
      if (!loadedAssetId) return;
      songMs = Number.isFinite(audio.duration) ? audio.duration * 1000 : undefined;
      sync();
    };
    audio.addEventListener('loadedmetadata', onReady);
    audio.addEventListener('durationchange', onReady);

    void load(useEditorStore.getState().project?.audio?.assetId);
    const unsubscribeProject = useEditorStore.subscribe((state, previous) => {
      const assetId = state.project?.audio?.assetId;
      if (assetId !== previous.project?.audio?.assetId) void load(assetId);
      else if (state.project !== previous.project) sync();
    });
    const unsubscribePlayback = usePlaybackStore.subscribe(sync);

    return () => {
      generation += 1;
      unsubscribeProject();
      unsubscribePlayback();
      audio.removeEventListener('loadedmetadata', onReady);
      audio.removeEventListener('durationchange', onReady);
      unload();
    };
  }, []);

  return <audio ref={ref} preload="auto" hidden data-testid="preview-music" />;
}
