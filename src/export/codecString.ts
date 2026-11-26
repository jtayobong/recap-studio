/**
 * Codec strings with a level that fits the frame rate (D35). Pure, no Mediabunny import, so the
 * capability check on the main thread can use it without loading the exporter.
 */

/**
 * H.264 levels: max macroblocks per second, max frame size (macroblocks), max bitrate (Main/High
 * base values, as Mediabunny uses). https://en.wikipedia.org/wiki/Advanced_Video_Coding#Levels
 */
const AVC_LEVELS = [
  { mbPerS: 1_485, frameMbs: 99, bitrate: 64_000, level: 0x0a },
  { mbPerS: 3_000, frameMbs: 396, bitrate: 192_000, level: 0x0b },
  { mbPerS: 6_000, frameMbs: 396, bitrate: 384_000, level: 0x0c },
  { mbPerS: 11_880, frameMbs: 396, bitrate: 768_000, level: 0x0d },
  { mbPerS: 11_880, frameMbs: 396, bitrate: 2_000_000, level: 0x14 },
  { mbPerS: 19_800, frameMbs: 792, bitrate: 4_000_000, level: 0x15 },
  { mbPerS: 20_250, frameMbs: 1_620, bitrate: 4_000_000, level: 0x16 },
  { mbPerS: 40_500, frameMbs: 1_620, bitrate: 10_000_000, level: 0x1e },
  { mbPerS: 108_000, frameMbs: 3_600, bitrate: 14_000_000, level: 0x1f },
  { mbPerS: 216_000, frameMbs: 5_120, bitrate: 20_000_000, level: 0x20 },
  { mbPerS: 245_760, frameMbs: 8_192, bitrate: 20_000_000, level: 0x28 },
  { mbPerS: 245_760, frameMbs: 8_192, bitrate: 50_000_000, level: 0x29 },
  { mbPerS: 522_240, frameMbs: 8_704, bitrate: 50_000_000, level: 0x2a },
  { mbPerS: 589_824, frameMbs: 22_080, bitrate: 135_000_000, level: 0x32 },
  { mbPerS: 983_040, frameMbs: 36_864, bitrate: 240_000_000, level: 0x33 },
  { mbPerS: 2_073_600, frameMbs: 36_864, bitrate: 240_000_000, level: 0x34 },
] as const;

/** VP9 levels: max luma samples per second, max picture size, max bitrate. https://www.webmproject.org/vp9/levels/ */
const VP9_LEVELS = [
  { samplesPerS: 829_440, picture: 36_864, bitrate: 200_000, level: 10 },
  { samplesPerS: 2_764_800, picture: 73_728, bitrate: 800_000, level: 11 },
  { samplesPerS: 4_608_000, picture: 122_880, bitrate: 1_800_000, level: 20 },
  { samplesPerS: 9_216_000, picture: 245_760, bitrate: 3_600_000, level: 21 },
  { samplesPerS: 20_736_000, picture: 552_960, bitrate: 7_200_000, level: 30 },
  { samplesPerS: 36_864_000, picture: 983_040, bitrate: 12_000_000, level: 31 },
  { samplesPerS: 83_558_400, picture: 2_228_224, bitrate: 18_000_000, level: 40 },
  { samplesPerS: 160_432_128, picture: 2_228_224, bitrate: 30_000_000, level: 41 },
  { samplesPerS: 311_951_360, picture: 8_912_896, bitrate: 60_000_000, level: 50 },
  { samplesPerS: 588_251_136, picture: 8_912_896, bitrate: 120_000_000, level: 51 },
  { samplesPerS: 1_176_502_272, picture: 8_912_896, bitrate: 180_000_000, level: 52 },
  { samplesPerS: 1_176_502_272, picture: 35_651_584, bitrate: 180_000_000, level: 60 },
  { samplesPerS: 2_353_004_544, picture: 35_651_584, bitrate: 240_000_000, level: 61 },
  { samplesPerS: 4_706_009_088, picture: 35_651_584, bitrate: 480_000_000, level: 62 },
] as const;

/**
 * The full codec string for the encoder, with a level that fits the frame rate too. Mediabunny
 * picks the level from size and bitrate only, so 1080p at 60 fps would claim level 4.0 (H.264) /
 * 4.0 (VP9), which only allow ~30 fps. At 30 fps this gives the same strings Mediabunny does.
 */
export function videoCodecString(codec: 'avc' | 'vp9', width: number, height: number, fps: number, bitrate: number): string {
  if (codec === 'avc') {
    const frameMbs = Math.ceil(width / 16) * Math.ceil(height / 16);
    const fit = AVC_LEVELS.find((l) => frameMbs <= l.frameMbs && frameMbs * fps <= l.mbPerS && bitrate <= l.bitrate);
    const level = (fit ?? AVC_LEVELS[AVC_LEVELS.length - 1]!).level;
    return `avc1.6400${level.toString(16).padStart(2, '0')}`; // High profile
  }
  const picture = width * height;
  const fit = VP9_LEVELS.find((l) => picture <= l.picture && picture * fps <= l.samplesPerS && bitrate <= l.bitrate);
  const level = (fit ?? VP9_LEVELS[VP9_LEVELS.length - 1]!).level;
  return `vp09.00.${String(level).padStart(2, '0')}.08`; // Profile 0, 8-bit
}
