import { describe, expect, it } from 'vitest';
import { AssetSchema, clearAssetReferences, countAssetReferences, isSupportedMimeType, normalizeFilename, remapAssetIds } from './asset';
import { createProject, type Project } from './project';

const validAsset = {
  id: '0b8f3c5e-6a43-4c0e-9d0b-2f7f7d1f0a11',
  projectId: 'p1',
  kind: 'image',
  mime: 'image/png',
  filename: 'beach.png',
  bytes: 1234,
  width: 800,
  height: 600,
  createdAt: 1,
};

describe('AssetSchema', () => {
  it('accepts a valid asset', () => {
    expect(AssetSchema.parse(validAsset)).toEqual(validAsset);
  });

  it('rejects a kind that does not match the MIME type', () => {
    expect(AssetSchema.safeParse({ ...validAsset, kind: 'video' }).success).toBe(false);
  });

  it('accepts audio without dimensions', () => {
    const audio = { ...validAsset, kind: 'audio', mime: 'audio/mpeg', filename: 'song.mp3', width: undefined, height: undefined, durationMs: 185_000 };
    expect(AssetSchema.safeParse(audio).success).toBe(true);
    expect(AssetSchema.safeParse({ ...audio, kind: 'image' }).success).toBe(false);
  });

  it('rejects unsupported MIME types', () => {
    expect(AssetSchema.safeParse({ ...validAsset, mime: 'image/svg+xml' }).success).toBe(false);
  });

  it.each(['../evil', 'a/b', '', 'x'.repeat(65), 'thumbs\\x'])('rejects unsafe id %j', (id) => {
    expect(AssetSchema.safeParse({ ...validAsset, id }).success).toBe(false);
  });
});

describe('isSupportedMimeType', () => {
  it('only accepts known formats, not inherited keys', () => {
    expect(isSupportedMimeType('video/webm')).toBe(true);
    expect(isSupportedMimeType('text/html')).toBe(false);
    expect(isSupportedMimeType('toString')).toBe(false);
  });
});

describe('normalizeFilename', () => {
  it('strips paths and control characters', () => {
    expect(normalizeFilename('C:\\Users\\me\\Pictures\\a\u0000b.jpg')).toBe('ab.jpg');
    expect(normalizeFilename('../../etc/passwd')).toBe('passwd');
  });

  it('falls back for empty names and caps length', () => {
    expect(normalizeFilename('   ')).toBe('untitled');
    expect(normalizeFilename(`${'x'.repeat(300)}.png`)).toHaveLength(255);
  });
});

describe('remapAssetIds', () => {
  function projectWithMedia(): Project {
    const project = createProject({ name: 'Media' }, { now: 1 });
    return {
      ...project,
      scenes: [
        { id: 's1', templateId: 'photo', durationMs: 3000, fields: { media: 'old-a', caption: 'Hi' }, transitionIn: 'fade' },
        { id: 's2', templateId: 'title', durationMs: 3000, fields: { text: 'No media' }, transitionIn: 'cut' },
      ],
      audio: { assetId: 'old-b', offsetMs: 0, volume: 1 },
    };
  }

  it('rewrites scene fields and the audio track', () => {
    const project = projectWithMedia();
    const next = remapAssetIds(
      project,
      new Map([
        ['old-a', 'new-a'],
        ['old-b', 'new-b'],
      ]),
    );
    expect(next.scenes[0]?.fields).toEqual({ media: 'new-a', caption: 'Hi' });
    expect(next.audio?.assetId).toBe('new-b');
    // Scenes without references keep their identity; the input is not mutated.
    expect(next.scenes[1]).toBe(project.scenes[1]);
    expect(project.scenes[0]?.fields.media).toBe('old-a');
  });

  it('returns the same project for an empty map and adds no audio key', () => {
    const project = createProject({ name: 'Plain' }, { now: 1 });
    expect(remapAssetIds(project, new Map())).toBe(project);
    expect('audio' in remapAssetIds(project, new Map([['x', 'y']]))).toBe(false);
  });
});

describe('asset references', () => {
  const project: Project = {
    ...createProject({ name: 'Refs' }, { now: 1 }),
    scenes: [
      { id: 's1', templateId: 'photo', durationMs: 3000, fields: { media: 'a', caption: 'x' }, transitionIn: 'fade' },
      { id: 's2', templateId: 'collage', durationMs: 3000, fields: { left: 'a', right: 'a' }, transitionIn: 'fade' },
      { id: 's3', templateId: 'title', durationMs: 3000, fields: { text: 'b' }, transitionIn: 'cut' },
    ],
    audio: { assetId: 'c', offsetMs: 0, volume: 1 },
  };

  it('counts scenes (once each) and the audio track', () => {
    expect(countAssetReferences(project, ['a', 'c', 'unused'])).toEqual(
      new Map([
        ['a', 2],
        ['c', 1],
        ['unused', 0],
      ]),
    );
  });

  it('clears matching fields and keeps other scenes untouched', () => {
    const next = clearAssetReferences(project, 'a');
    expect(next.scenes[0]?.fields).toEqual({ media: '', caption: 'x' });
    expect(next.scenes[1]?.fields).toEqual({ left: '', right: '' });
    expect(next.scenes[2]).toBe(project.scenes[2]);
    expect(next.audio).toEqual(project.audio);
  });

  it('removes a matching audio track', () => {
    const next = clearAssetReferences(project, 'c');
    expect('audio' in next).toBe(false);
    expect(next.scenes).toEqual(project.scenes);
  });

  it('returns the same project when nothing references the asset', () => {
    expect(clearAssetReferences(project, 'zzz')).toBe(project);
  });
});
