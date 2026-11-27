import { useLiveQuery } from 'dexie-react-hooks';
import { useId, type KeyboardEvent } from 'react';
import { assetRepository } from '../db';
import type { Asset } from '../domain/asset';
import { musicStartMs } from '../domain/music';
import { MUSIC_FADE_IN_MS, MUSIC_FADE_OUT_MS, projectDurationMs, type AudioTrack, type Project, type Scene } from '../domain/project';
import { clearMusic, setMusic, updateMusic } from '../editor/musicActions';
import { formatDuration } from '../lib/format';
import type { MediaField } from '../render/fields';
import { getTemplate } from '../render/templates/registry';
import { MediaSlotField } from './MediaSlotField';

const SONG_FIELD: MediaField = { kind: 'media', label: 'Song', default: '', accept: ['audio'] };

/** Keys a slider handles itself; they must not also step the playhead (window shortcuts). */
const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
const keepSliderKeys = (event: KeyboardEvent) => {
  if (SLIDER_KEYS.has(event.key)) event.stopPropagation();
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace(/\.0$/, '')} s`;

/** Project panel: the story's music track (one song) and how it plays. */
export function MusicSection({ project }: { project: Project }) {
  const titleId = useId();
  const library = useLiveQuery(() => assetRepository.listForProject(project.id), [project.id]);
  const track = project.audio;
  const song = track ? library?.find((asset) => asset.id === track.assetId) : undefined;

  return (
    <section className="music-section" aria-labelledby={titleId}>
      <h3 id={titleId} className="inspector__heading">
        Music
      </h3>
      <MediaSlotField
        def={SONG_FIELD}
        value={track?.assetId ?? ''}
        projectId={project.id}
        onChange={(assetId) => (assetId ? setMusic(assetId) : clearMusic())}
      />
      {track && song?.kind === 'audio' && <MusicSettings track={track} song={song} storyMs={projectDurationMs(project)} scenes={project.scenes} />}
    </section>
  );
}

/** "Scene 3 · Photo carousel" */
const sceneLabel = (scene: Scene, index: number) => `Scene ${index + 1} · ${getTemplate(scene.templateId)?.name ?? scene.templateId}`;

function MusicSettings({ track, song, storyMs, scenes }: { track: AudioTrack; song: Asset; storyMs: number; scenes: readonly Scene[] }) {
  const startId = useId();
  const sceneId = useId();
  // Where in the story the music starts (a missing scene means the story start).
  const musicStart = musicStartMs(track, scenes);
  // The first scene is the story start (''); a deleted scene also falls back to it.
  const startScene = scenes.slice(1).some((s) => s.id === track.startSceneId) ? (track.startSceneId ?? '') : '';
  const playMs = Math.max(0, storyMs - musicStart);
  const volumeId = useId();
  const songMs = song.durationMs ?? 0;
  // Leave at least a second of song to play.
  const maxStartMs = Math.max(0, songMs - 1000);
  const startMs = Math.min(track.offsetMs, maxStartMs);
  const remainingMs = Math.max(0, songMs - startMs);
  const volumePercent = Math.round(track.volume * 100);

  const span = `${formatDuration(startMs)}–${formatDuration(startMs + playMs)}`;
  const summary =
    remainingMs < playMs
      ? `The song ends ${formatDuration(musicStart + remainingMs)} into the story; after that it’s silent.`
      : musicStart > 0
        ? `Silent until ${formatDuration(musicStart)}, then plays ${span} of the song to the end of the story.`
        : `Plays ${span} of the song, for the whole story.`;

  return (
    <div className="music-settings">
      <div className="field">
        <label className="field__label" htmlFor={sceneId}>
          Music starts with
        </label>
        <select id={sceneId} value={startScene} onChange={(event) => updateMusic({ startSceneId: event.target.value })}>
          {scenes.map((scene, index) => (
            <option key={scene.id} value={index === 0 ? '' : scene.id}>
              {index === 0 ? `${sceneLabel(scene, index)} (story start)` : sceneLabel(scene, index)}
            </option>
          ))}
          {scenes.length === 0 && <option value="">The story start</option>}
        </select>
      </div>

      <div className="field">
        <div className="field__row">
          <label className="field__label" htmlFor={startId}>
            Start the song at
          </label>
          <output className="field__counter" htmlFor={startId}>
            {formatDuration(startMs)} of {formatDuration(songMs)}
          </output>
        </div>
        <input
          id={startId}
          type="range"
          min={0}
          max={maxStartMs}
          step={100}
          value={startMs}
          disabled={maxStartMs === 0}
          aria-valuetext={`${formatDuration(startMs)} into the song`}
          onKeyDown={keepSliderKeys}
          onChange={(event) => updateMusic({ offsetMs: Number(event.target.value) }, 'music:offset')}
        />
      </div>

      <div className="field">
        <div className="field__row">
          <label className="field__label" htmlFor={volumeId}>
            Volume
          </label>
          <output className="field__counter" htmlFor={volumeId}>
            {volumePercent}%
          </output>
        </div>
        <input
          id={volumeId}
          type="range"
          min={0}
          max={100}
          step={1}
          value={volumePercent}
          aria-valuetext={`${volumePercent}%`}
          onKeyDown={keepSliderKeys}
          onChange={(event) => updateMusic({ volume: Number(event.target.value) / 100 }, 'music:volume')}
        />
      </div>

      <label className="field field--inline">
        <input type="checkbox" checked={track.fadeIn} onChange={(event) => updateMusic({ fadeIn: event.target.checked })} />
        <span className="field__label">Fade in ({seconds(MUSIC_FADE_IN_MS)})</span>
      </label>
      <label className="field field--inline">
        <input type="checkbox" checked={track.fadeOut} onChange={(event) => updateMusic({ fadeOut: event.target.checked })} />
        <span className="field__label">Fade out at the end ({seconds(MUSIC_FADE_OUT_MS)})</span>
      </label>

      <p className="field__hint" aria-live="polite">
        {summary}
      </p>
    </div>
  );
}
