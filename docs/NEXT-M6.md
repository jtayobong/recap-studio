# Next up: M6, audio

**Goal:** one music track per story: import an audio file, set where it starts and how loud it is,
hear it in the preview in sync with the playhead, and get it mixed into the exported video.

**Done when:** a story with a music track exports to an MP4 (AAC) or WebM (Opus) whose audio starts
at the right moment, has the right length and level, and plays in sync with the video; the preview
plays the same audio in sync, including after seeking. `npm run check` and `npm run test:e2e` pass.

These are notes, not final decisions. Confirm anything marked **open** with the user before building.

## What M4/M5 leave in place

- The project schema already has `audio?: { assetId, offsetMs, volume }` (`AudioTrackSchema`),
  so adding a track needs **no schema migration**. `remapAssetIds`, `countAssetReferences`,
  `clearAssetReferences` and `mediaAssetIds` already handle `project.audio`.
- Assets: `kind: 'audio'` exists in `AssetSchema`, but no audio MIME types are accepted yet
  (`SUPPORTED_MIME_TYPES`), the sniffer has no audio signatures, and there are no audio limits.
- Export: `exportStory` already gathers `project.audio`'s file and hands it to the worker; the
  worker ignores it. Mediabunny can encode audio (`AudioBufferSource` / `AudioSampleSource`,
  codecs `aac` and `opus`) and decode it in the worker (`AudioSampleSink`).
- The export dialog shows the format; the music-rights notice was deferred to M6 (decided in M5).
- `lib/capabilities.ts` already probes AAC and Opus encoders.

## Suggested breakdown

1. **Import:** accept MP3, M4A/AAC, WAV, OGG/Opus, FLAC (**open:** exact list); sniff by magic
   bytes; limits (**open:** e.g. ≤ 100 MB, ≤ 10 min); probe duration with an `<audio>` element;
   a waveform or plain icon thumbnail (**open**). Library tiles show audio with its duration.
2. **Audio track UI:** a "Music" section in the project panel (no scene selected): pick or drop a
   track, start offset (**open:** offset into the song vs delay before it starts), volume, fade-out
   at the end (**open**), clear. All undoable `update`s through an editor action.
3. **Preview:** one `<audio>` element following the playback store, the same way clips follow the
   playhead (seek while paused, play along while playing, re-sync on drift). Mute toggle.
4. **Export:** decode the track in the worker with Mediabunny, cut it to the story length starting
   at the offset, apply volume (and fade), and encode AAC (MP4) or Opus (WebM) next to the video.
   Note: `OfflineAudioContext` is *not* available in workers; either mix on the main thread and
   transfer PCM, or mix in the worker by hand (gain + fade on `AudioSample` data).
5. **Tests:** sniffing + limits, schema/actions, export e2e that decodes the audio track and checks
   duration, start offset (e.g. a click at a known time) and level.

## Open questions for the user

- Which audio formats to accept, and the size/length limits.
- Offset semantics: "start the song at 0:45" (skip into it) and/or "start playing after 2 s".
- Fade-out at the end of the story: always, optional, or not at all? Fade-in?
- If the song is shorter than the story: silence after it, or loop?
- Wording and placement of the music-rights notice in the export dialog.
