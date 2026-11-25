import { ALL_FORMATS, AudioSample, AudioSampleSink, BlobSource, canEncodeAudio, Input, Quality, type AudioCodec } from 'mediabunny';
import { musicEndMs } from '../domain/music';
import type { AudioTrack } from '../domain/project';
import { mixMusicBlock } from './musicMix';
import type { ExportContainer } from './target';

/** Encoded music: 48 kHz stereo (accepted by both AAC and Opus encoders; Mediabunny resamples). */
export const MUSIC_SAMPLE_RATE = 48_000;
export const MUSIC_CHANNELS = 2;
export const MUSIC_BITRATE = 160_000;

export function musicCodecFor(container: ExportContainer): AudioCodec {
  return container === 'mp4' ? 'aac' : 'opus';
}

export async function canEncodeMusic(codec: AudioCodec): Promise<boolean> {
  return canEncodeAudio(codec, {
    sampleRate: MUSIC_SAMPLE_RATE,
    numberOfChannels: MUSIC_CHANNELS,
    quality: new Quality({ bitrate: MUSIC_BITRATE }),
  });
}

export interface MusicStream {
  /** Mixed blocks in story time, from the first audible frame to where the music stops. */
  samples: AsyncIterable<AudioSample>;
  dispose(): void;
}

/**
 * Decode the song (worker-safe: Mediabunny, no Web Audio), from the start point to where the music
 * stops, and mix each block with `mixMusicBlock` (gain + fades + story timing). Returns null when
 * nothing of the song is heard (start point past its end). Throws if the file can't be decoded.
 */
export async function openMusicStream(file: Blob, track: AudioTrack, storyMs: number): Promise<MusicStream | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack) throw new Error('The music file has no audio track.');
    if (!(await audioTrack.canDecode())) throw new Error(`This browser can't decode ${audioTrack.codec ?? 'this'} audio.`);
    const songMs = (await audioTrack.computeDuration()) * 1000;
    const endMs = musicEndMs(track, storyMs, songMs);
    if (endMs <= 0) {
      input.dispose();
      return null;
    }

    const sink = new AudioSampleSink(audioTrack);
    const context = { track, storyMs, songMs };
    async function* samples(): AsyncGenerator<AudioSample> {
      for await (const sample of sink.samples(track.offsetMs / 1000, (track.offsetMs + endMs) / 1000)) {
        try {
          const planes: Float32Array[] = [];
          for (let channel = 0; channel < sample.numberOfChannels; channel += 1) {
            const options = { planeIndex: channel, format: 'f32-planar' as const };
            const plane = new Float32Array(sample.allocationSize(options) / Float32Array.BYTES_PER_ELEMENT);
            sample.copyTo(plane, options);
            planes.push(plane);
          }
          const mixed = mixMusicBlock({ planes, sampleRate: sample.sampleRate, startS: sample.timestamp }, context);
          if (!mixed) continue;
          const frames = mixed.planes[0]!.length;
          const data = new Float32Array(frames * mixed.planes.length);
          mixed.planes.forEach((plane, channel) => data.set(plane, channel * frames));
          yield new AudioSample({
            data,
            format: 'f32-planar',
            numberOfChannels: mixed.planes.length,
            sampleRate: mixed.sampleRate,
            timestamp: mixed.startS,
          });
        } finally {
          sample.close();
        }
      }
    }

    return { samples: samples(), dispose: () => input.dispose() };
  } catch (error) {
    input.dispose();
    throw error;
  }
}
