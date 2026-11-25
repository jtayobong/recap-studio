# M6, audio: ✅ done (2026-11-25)

Kept as the design record for M6 (decisions D25–D27); the next milestone is in `NEXT-M7.md`.
Delivered: audio import (MP3, M4A/AAC, WAV, OGG, FLAC; audio-only MP4/WebM), one music track per
story (start point, volume, optional fades, schema v2), music in the preview in sync with the
playhead (with mute), and music mixed into the export (AAC/Opus) by the same timing and fade rules.

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
- Assets: `kind: 'audio'` existed in `AssetSchema` (formats, sniffing and limits were added in
  step 1).
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
- **Step 2 done (2026-11-25): music track UI + schema v2.** `audio` gained `fadeIn`/`fadeOut`
  (migration 1→2 tested with a real v1 fixture, `domain/fixtures/project-v1.json`, and in the
  browser with a raw v1 row). Music section in the project panel (`MusicSection`): song slot
  (reuses `MediaSlotField`, audio only), start point slider, volume, fade toggles and a summary of
  which part of the song plays. Actions in `editor/musicActions.ts` (undoable; one undo step per
  slider drag). Sliders keep arrow/Home/End keys from also moving the playhead. A song used as
  the music shows "Story music" in the library.
- **Step 3 done (2026-11-25): music in the preview.** `domain/music.ts` holds the shared rules
  (song time, when the music stops, gain = volume × fade in × fade out) for preview and export.
  `preview/musicSync.ts` steers an audio element: seek when starting, play along, re-seek only past
  0.2 s drift, volume per frame, pause outside the music. `PreviewMusic` is a hidden `<audio>`
  driven by store subscriptions (no React re-renders). Mute is UI-only (playback store), with a
  button next to Loop and the **M** key; it keeps the music in sync, just silent.
- **Step 4 done (2026-11-25): music in the export.** The worker decodes the song with Mediabunny
  (`musicStream.ts`, from the start point to where the music stops) and mixes each block with
  `mixMusicBlock` (`musicMix.ts`: trim + `musicGain` per frame + story timing, the same rules as the
  preview). Encoded as AAC (MP4) or Opus (WebM), resampled to 48 kHz stereo, 160 kbps, fed
  interleaved ~1 s ahead of the video. If the song is missing, undecodable or the codec can't be
  encoded, the video still exports without music and `music.note` says why (shown in the header).
  The export dialog shows the rights note only when the story has music.
  e2e decodes the exported audio: a silent marker in the song lands exactly where the start point
  puts it, levels match the volume, the fade-out ramps, an early-ending song stops early, fade-in
  starts silent, WebM gets Opus.

**The M6 done-when is met** (export with correctly timed audio, preview in sync), verified by the
e2e tests in `e2e/music.spec.ts` and `e2e/export.spec.ts`.

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
