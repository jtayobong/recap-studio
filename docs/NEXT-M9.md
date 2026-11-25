# Next: after the original roadmap (M0–M8 done)

The plan in `PLAN.md` is complete: a fresh user can go from a starter story, through their own
numbers, photos, clips and music, to a downloaded MP4, with tested failure paths along the way.
This note collects candidates for what comes next. Nothing here is decided.

## Candidates

1. **Project bundles** (deferred from M8 by the user): save a project with its media as one file
   (e.g. `.recap.zip`) to back up or move to another computer, and import it back.
   - Strip EXIF/GPS from photos that were stored byte-for-byte (≤ 2160 px).
   - Validate everything on import: Zod for the document (with migrations), unknown templates,
     asset ids, magic bytes for every file, size caps and zip-bomb limits.
   - Needs a zip reader/writer: a small dependency, or the browser's `CompressionStream` (deflate)
     plus a minimal zip container written by hand. **Ask before adding a dependency.**
2. **Postponed ideas from PLAN.md §8:** CSV/manual stats import (Spotify-style data without an
   API), beat detection to sync cuts to music, keyframes / a multi-track timeline, a template
   builder, WebGL effects, other aspect ratios (square/landscape are scaffolded but disabled),
   GIF/WebM/4K/60 fps exports, Firefox/Safari support, mobile layout, desktop packaging.
3. **Known gaps** (CLAUDE.md): project cards use a static tile instead of a rendered frame; text can
   look slightly different between operating systems (system fonts); the preview's clip playback is
   approximate (the export is exact); audio tiles have no waveform.

## Open questions for the user

- Is there a next milestone you want, and which of the candidates (or something else)?
- If project bundles: backup only (same app, another computer), or also for sharing?
