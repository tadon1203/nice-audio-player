import { describe, expect, it } from "vitest";
import { levelToUnit } from "$lib/ui/waveform/waveform-model";
import { energyAt, trackEnergy } from "./track-energy";

describe("trackEnergy", () => {
  const rms = [0, 51, 102, 255];

  it("puts every bucket on the waveform bars' dB scale", () => {
    const energy = trackEnergy(rms)!;
    expect(Array.from(energy)).toEqual(rms.map((level) => Math.fround(levelToUnit(level))));
    expect(energy[0]).toBe(0);
    expect(energy[3]).toBe(1);
  });

  it("is computed once per waveform", () => {
    expect(trackEnergy(rms)).toBe(trackEnergy(rms));
  });

  it("has nothing for a missing or empty waveform", () => {
    expect(trackEnergy(null)).toBeNull();
    expect(trackEnergy([])).toBeNull();
  });
});

describe("energyAt", () => {
  const energy = trackEnergy([0, 51, 102, 255])!;

  it("reads the bucket under a share of the track", () => {
    expect(energyAt(energy, 0)).toBe(0);
    expect(energyAt(energy, 0.4)).toBeCloseTo(1 - 13.98 / 36, 2);
    expect(energyAt(energy, 1)).toBe(1);
  });

  it("clamps outside the track and is 0 when unknown", () => {
    expect(energyAt(energy, -1)).toBe(0);
    expect(energyAt(energy, 7)).toBe(1);
    expect(energyAt(null, 0.5)).toBe(0);
  });
});
