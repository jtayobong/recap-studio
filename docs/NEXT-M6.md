# Next up: M6, audio

**Goal:** one music track per story: import an audio file, set where it starts and how loud it is,
hear it in the preview in sync with the playhead, and get it mixed into the exported video.

**Done when:** a story with a music track exports to an MP4 (AAC) or WebM (Opus) whose audio starts
at the right moment, has the right length and level, and plays in sync with the video; the preview
plays the same audio in sync, including after seeking. `npm run check` and `npm run test:e2e` pass.

Design notes; the open questions are settled (see **Decisions** at the end).

## What M4/M5 leave in place

- The project schema already has `audio?: { assetId, offsetMs, volume }` (`AudioTrackSchema`);
  only the fade toggles are new (schema v2, see Decisions). `remapAssetIds`, `countAssetReferences`,
  `clearAssetReferences` and `mediaAssetIds` already handle `project.audio`.
- Assets: `kind: 'audio'` exists in `AssetSchema`, but no audio MIME types are accepted yet
  (`SUPPORTED_MIME_TYPES`), the sniffer has no audio signatures, and there are no audio limits.
- Export: `exportStory` already gathers `project.audio`'s file and hands it to the worker; the
  worker ignores it. Mediabunny can encode audio (`AudioBufferSource` / `AudioSampleSource`,
  codecs `aac` and `opus`) and decode it in the worker (`AudioSampleSink`).
- The export dialog shows the format; the music-rights notice was deferred to M6 (decided in M5).
- `lib/capabilities.ts` already probes AAC and Opus encoders.

## Progress

- **Step 1 done (2026-11-25): audio import.** MP3 (ID3 or bare frames), ADTS AAC, M4A/M4B, WAV,
  OGG and FLAC are sniffed by magic bytes. Audio-only MP4/MOV/WebM (voice memos, recordings)
  still sniff as video; when probing finds no picture (`NoVideoTrackError`) the importer imports
  them as `audio/mp4` / `audio/webm`. Limits 100 MB / 10 min; duration via an `<audio>` element.
  Library tiles show ♪ + duration; photo/clip slots and the preview cache ignore audio.

## Suggested breakdown

1. **Import:** accept MP3, M4A/AAC, WAV, OGG/Opus, FLAC; sniff by magic bytes; ≤ 100 MB and
   ≤ 10 min; probe duration with an `<audio>` element; a plain music-note tile (a waveform could
   come later). Library tiles show audio with its duration.
2. **Audio track UI:** a "Music" section in the project panel (no scene selected): pick or drop a
   track, start point in the song, volume, fade in / fade out toggles, clear. All undoable
   `update`s through an editor action. Schema v2 for the fade fields (see Decisions).
3. **Preview:** one `<audio>` element following the playback store, the same way clips follow the
   playhead (seek while paused, play along while playing, re-sync on drift). Mute toggle.
4. **Export:** decode the track in the worker with Mediabunny, cut it to the story length starting
   at the offset, apply volume (and fade), and encode AAC (MP4) or Opus (WebM) next to the video.
   Note: `OfflineAudioContext` is *not* available in workers; either mix on the main thread and
   transfer PCM, or mix in the worker by hand (gain + fade on `AudioSample` data).
5. **Tests:** sniffing + limits, schema/actions, export e2e that decodes the audio track and checks
   duration, start offset (e.g. a click at a known time) and level.

## Decisions (confirmed with the user, 2026-11-25)

- **Formats and limits:** MP3, M4A/AAC, WAV, OGG/Opus and FLAC, detected by magic bytes;
  up to 100 MB and 10 minutes.
- **Timing:** a *start point in the song* ("start at 0:45"); the music always begins with the
  story. The existing `audio.offsetMs` field is defined as that start point (no delay control).
- **Fades:** optional, two toggles in the music section: fade in (~1 s, off by default) and fade
  out (~1.5 s, on by default).
- **Song shorter than the story:** it plays once, then silence (no loop). With fade out on, the
  fade happens over the last 1.5 s of whichever ends first: the song or the story.
- **Rights notice:** one muted line in the export dialog, only when the story has music: "Make sure
  you have the rights to use this music before sharing the video." No checkbox.

**Schema consequence:** the fade toggles are new stored fields (`audio.fadeIn`, `audio.fadeOut`),
so M6 needs schema version 2 with a migration from 1 (defaults: `fadeIn: false`, `fadeOut: true`)
and a test with a real v1 fixture (CLAUDE.md invariant 2). Documenting `offsetMs` as the start
point needs no migration, since no project has a music track yet.
