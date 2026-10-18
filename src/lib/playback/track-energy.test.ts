import { describe, expect, it } from "vitest";
import { Waveform } from "#lib/ui/waveform/waveform-model";
import { TrackEnergy } from "./track-energy";

describe("TrackEnergy.of", () => {
  const rms = [0, 51, 102, 255];

  it("puts every bucket on the waveform bars' dB scale", () => {
    const energy = TrackEnergy.of(rms)!;
    expect(Array.from(energy)).toEqual(
      rms.map((level) => Math.fround(Waveform.levelToUnit(level))),
    );
    expect(energy[0]).toBe(0);
    expect(energy[3]).toBe(1);
  });

  it("is computed once per waveform", () => {
    expect(TrackEnergy.of(rms)).toBe(TrackEnergy.of(rms));
  });

  it("has nothing for a missing or empty waveform", () => {
    expect(TrackEnergy.of(null)).toBeNull();
    expect(TrackEnergy.of([])).toBeNull();
  });
});

describe("TrackEnergy.at", () => {
  const energy = TrackEnergy.of([0, 51, 102, 255])!;

  it("reads the bucket under a share of the track", () => {
    expect(TrackEnergy.at(energy, 0)).toBe(0);
    expect(TrackEnergy.at(energy, 0.4)).toBeCloseTo(1 - 13.98 / 36, 2);
    expect(TrackEnergy.at(energy, 1)).toBe(1);
  });

  it("clamps outside the track and is 0 when unknown", () => {
    expect(TrackEnergy.at(energy, -1)).toBe(0);
    expect(TrackEnergy.at(energy, 7)).toBe(1);
    expect(TrackEnergy.at(null, 0.5)).toBe(0);
  });
});
