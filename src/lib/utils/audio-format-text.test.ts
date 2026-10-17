import { describe, expect, it } from "vitest";
import { AudioFormatText } from "./audio-format-text";
import { MISSING } from "./missing";

describe("AudioFormatText.sampleRate", () => {
  it("formats hertz as kHz and marks unknown values", () => {
    expect(AudioFormatText.sampleRate(44_100)).toBe("44.1 kHz");
    expect(AudioFormatText.sampleRate(null)).toBe(MISSING);
    expect(AudioFormatText.sampleRate(Number.NaN)).toBe(MISSING);
  });
});

describe("AudioFormatText.path", () => {
  it("writes lossless sources as codec, bit depth and kHz", () => {
    expect(AudioFormatText.path({ format: "flac", bitDepth: 24, sampleRate: 96_000 })).toBe(
      "FLAC 24/96",
    );
    expect(AudioFormatText.path({ format: "wav", bitDepth: 16, sampleRate: 44_100 })).toBe(
      "WAV 16/44.1",
    );
  });

  it("writes lossy sources with their bitrate", () => {
    expect(AudioFormatText.path({ format: "aac", sampleRate: 44_100, bitrateKbps: 256 })).toBe(
      "AAC 256k",
    );
  });

  it("leaves out what is unknown", () => {
    expect(AudioFormatText.path({ format: "mp3" })).toBe("MP3");
    expect(AudioFormatText.path({ format: null })).toBe(MISSING);
  });
});

describe("AudioFormatText.kilohertz", () => {
  it("drops the trailing zero", () => {
    expect(AudioFormatText.kilohertz(48_000)).toBe("48");
    expect(AudioFormatText.kilohertz(44_100)).toBe("44.1");
    expect(AudioFormatText.kilohertz(null)).toBe(MISSING);
  });
});
