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
    ['RIFF that is not WebP (WAV)', bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt ')],
    ['truncated PNG', bytes([0x89, 0x50, 0x4e])],
  ])('rejects %s', (_name, header) => {
    expect(sniffMimeType(header)).toBeUndefined();
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
