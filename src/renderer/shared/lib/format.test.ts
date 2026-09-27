import { describe, expect, it } from "vitest";
import {
  MISSING,
  formatAudioPath,
  formatCount,
  formatDuration,
  formatKilohertz,
  formatNumber,
  formatSampleRate,
} from "./format";

describe("formatDuration", () => {
  it("formats null and sub-hour durations", () => {
    expect(formatDuration(null)).toBe(MISSING);
    expect(formatDuration(125_000)).toBe("2:05");
  });

  it("includes hours without dropping zero padding", () => {
    expect(formatDuration(3_723_000)).toBe("1:02:03");
  });
});

describe("formatSampleRate", () => {
  it("formats hertz as kHz and marks unknown values", () => {
    expect(formatSampleRate(44_100)).toBe("44.1 kHz");
    expect(formatSampleRate(null)).toBe(MISSING);
    expect(formatSampleRate(Number.NaN)).toBe(MISSING);
  });
});

describe("formatNumber", () => {
  it("groups digits and marks unknown values", () => {
    expect(formatNumber(1234)).toBe((1234).toLocaleString());
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(undefined)).toBe(MISSING);
  });
});

describe("formatCount", () => {
  it("uses the singular only for exactly one", () => {
    expect(formatCount(1, "album")).toBe("1 album");
    expect(formatCount(0, "album")).toBe("0 albums");
    expect(formatCount(2, "album")).toBe("2 albums");
  });

  it("supports irregular plurals and unknown counts", () => {
    expect(formatCount(2, "album artist", "album artists")).toBe("2 album artists");
    expect(formatCount(null, "track")).toBe(`${MISSING} tracks`);
  });
});

describe("formatAudioPath", () => {
  it("writes lossless sources as codec, bit depth and kHz", () => {
    expect(formatAudioPath({ format: "flac", bitDepth: 24, sampleRate: 96_000 })).toBe(
      "FLAC 24/96",
    );
    expect(formatAudioPath({ format: "wav", bitDepth: 16, sampleRate: 44_100 })).toBe(
      "WAV 16/44.1",
    );
  });

  it("writes lossy sources with their bitrate", () => {
    expect(formatAudioPath({ format: "aac", sampleRate: 44_100, bitrateKbps: 256 })).toBe(
      "AAC 256k",
    );
  });

  it("leaves out what is unknown", () => {
    expect(formatAudioPath({ format: "mp3" })).toBe("MP3");
    expect(formatAudioPath({ format: null })).toBe(MISSING);
  });
});

describe("formatKilohertz", () => {
  it("drops the trailing zero", () => {
    expect(formatKilohertz(48_000)).toBe("48");
    expect(formatKilohertz(44_100)).toBe("44.1");
    expect(formatKilohertz(null)).toBe(MISSING);
  });
});
