import { describe, expect, it } from 'vitest';
import { readHeader, sniffMimeType, SNIFF_BYTES } from './sniff';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part)));

const ftyp = (brand: string) => bytes([0, 0, 0, 0x20], 'ftyp', brand, [0, 0, 2, 0], 'isomiso2');

describe('sniffMimeType', () => {
  it.each([
    ['JPEG', bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'JFIF'), 'image/jpeg'],
    ['PNG', bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d], 'IHDR'), 'image/png'],
    ['GIF87a', bytes('GIF87a', [1, 0, 1, 0]), 'image/gif'],
    ['GIF89a', bytes('GIF89a', [1, 0, 1, 0]), 'image/gif'],
    ['WebP', bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 '), 'image/webp'],
    ['MP4 (isom)', ftyp('isom'), 'video/mp4'],
    ['MP4 (mp42)', ftyp('mp42'), 'video/mp4'],
    ['MOV', ftyp('qt  '), 'video/quicktime'],
    ['WebM', bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84], 'webm'), 'video/webm'],
    ['MP3 with ID3 tag', bytes('ID3', [4, 0, 0, 0, 0, 0, 0x23]), 'audio/mpeg'],
    ['MP3 frame (MPEG-1 Layer III)', bytes([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]), 'audio/mpeg'],
    ['MP3 frame (MPEG-2 Layer III)', bytes([0xff, 0xf3, 0x90, 0x64]), 'audio/mpeg'],
    ['ADTS AAC', bytes([0xff, 0xf1, 0x50, 0x80, 0x02, 0x1f, 0xfc]), 'audio/aac'],
    ['M4A', ftyp('M4A '), 'audio/mp4'],
    ['M4B audiobook', ftyp('M4B '), 'audio/mp4'],
    ['WAV', bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt '), 'audio/wav'],
    ['OGG', bytes('OggS', [0, 2, 0, 0]), 'audio/ogg'],
    ['FLAC', bytes('fLaC', [0, 0, 0, 0x22]), 'audio/flac'],
  ])('recognizes %s', (_name, header, mime) => {
    expect(sniffMimeType(header)).toBe(mime);
  });

  it.each([
    ['empty', bytes()],
    ['HTML', bytes('<!doctype html><script>')],
    ['SVG', bytes('<svg xmlns="http://www.w3.org/2000/svg">')],
    ['PDF', bytes('%PDF-1.7')],
    ['HEIC', ftyp('heic')],
    ['AVIF', ftyp('avif')],
    ['Matroska (not WebM)', bytes([0x1a, 0x45, 0xdf, 0xa3, 0xa3, 0x42, 0x82, 0x88], 'matroska')],
    ['RIFF that is neither WebP nor WAV (AVI)', bytes('RIFF', [0x24, 0, 0, 0], 'AVI LIST')],
    ['sync-like bytes with a reserved MPEG version', bytes([0xff, 0xea, 0x90])],
    ['truncated PNG', bytes([0x89, 0x50, 0x4e])],
  ])('rejects %s', (_name, header) => {
    expect(sniffMimeType(header)).toBeUndefined();
  });

  it('checks JPEG before MPEG audio (both start with 0xFF)', () => {
    expect(sniffMimeType(bytes([0xff, 0xd8, 0xff, 0xe1]))).toBe('image/jpeg');
  });

  it('ignores the file name and reported type', async () => {
    const disguised = new File(['<html>'], 'holiday.jpg', { type: 'image/jpeg' });
    expect(sniffMimeType(await readHeader(disguised))).toBeUndefined();
  });

  it('reads only the header', async () => {
    const file = new File([new Uint8Array(10_000)], 'big.bin');
    expect((await readHeader(file)).byteLength).toBe(SNIFF_BYTES);
  });
});
