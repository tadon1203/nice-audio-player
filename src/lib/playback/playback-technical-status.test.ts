import { describe, expect, it } from "vitest";
import { PlaybackTechnicalStatus } from "./playback-technical-status";

const direct = {
  sourceLabel: "FLAC 24/96",
  resamplingActive: false,
  outputSampleRate: 96_000,
  channelConversion: "none" as const,
  outputName: "Speakers",
};

describe("PlaybackTechnicalStatus.describe", () => {
  it("has no processing step when nothing touches the signal", () => {
    expect(PlaybackTechnicalStatus.describe(direct)).toMatchObject({
      source: "FLAC 24/96",
      processing: null,
      output: "Speakers",
    });
  });

  it("names the resampling target and channel conversion", () => {
    const path = PlaybackTechnicalStatus.describe({
      ...direct,
      resamplingActive: true,
      outputSampleRate: 48_000,
      channelConversion: "monoToStereo",
    });
    expect(path.processing).toBe("48 kHz, mono to stereo");
  });

  it("names a surround downmix", () => {
    const path = PlaybackTechnicalStatus.describe({ ...direct, channelConversion: "downmix" });
    expect(path.processing).toBe("surround downmix");
  });
});
