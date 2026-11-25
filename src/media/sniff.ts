import type { SupportedMimeType } from '../domain/asset';

/** How many leading bytes `sniffMimeType` needs. */
export const SNIFF_BYTES = 64;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = '';
  for (let i = offset; i < offset + length && i < bytes.length; i += 1) text += String.fromCharCode(bytes[i] ?? 0);
  return text;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, i) => bytes[offset + i] === value);
}

function indexOfAscii(bytes: Uint8Array, needle: string): number {
  outer: for (let i = 0; i + needle.length <= bytes.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

/** ISO-BMFF brands that are still images (HEIC/AVIF), not video. */
const IMAGE_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis']);

/**
 * Identify a file's real format from its first bytes. File names and the browser-reported
 * `type` are ignored: both come from the user and can be wrong or misleading.
 * Returns undefined for anything that isn't a supported format.
 */
export function sniffMimeType(header: Uint8Array): SupportedMimeType | undefined {
  if (startsWith(header, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  const gif = ascii(header, 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'image/gif';
  if (ascii(header, 0, 4) === 'RIFF' && ascii(header, 8, 4) === 'WEBP') return 'image/webp';

  if (ascii(header, 4, 4) === 'ftyp') {
    const brand = ascii(header, 8, 4);
    if (IMAGE_BRANDS.has(brand)) return undefined;
    return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }

  // EBML header: WebM is Matroska with DocType "webm". Generic Matroska (.mkv) is not accepted.
  if (startsWith(header, [0x1a, 0x45, 0xdf, 0xa3])) {
    return indexOfAscii(header, 'webm') !== -1 ? 'video/webm' : undefined;
  }

  return undefined;
}

export async function readHeader(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
}
