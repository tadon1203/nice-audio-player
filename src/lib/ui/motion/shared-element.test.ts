import { describe, expect, it } from "vitest";
import {
  DEPARTURE_TTL_MS,
  flightKeyframes,
  isFresh,
  lerpBox,
  sharedKey,
  type Box,
} from "./shared-element";

const tile: Box = { x: 100, y: 200, width: 160, height: 160, radius: 8 };
const header: Box = { x: 40, y: 60, width: 224, height: 224, radius: 8 };

describe("shared element keys", () => {
  it("pair an album by both parts of its key, and keep artists apart from albums", () => {
    const key = sharedKey.album({ albumArtist: "A", title: "B" });
    expect(key).toBe(sharedKey.album({ albumArtist: "A", title: "B" }));
    expect(key).not.toBe(sharedKey.album({ albumArtist: "B", title: "A" }));
    expect(sharedKey.artist("A")).not.toBe(sharedKey.album({ albumArtist: "", title: "A" }));
  });
});

describe("flight", () => {
  it("interpolates position, size and radius", () => {
    const round = { ...header, radius: 112 };
    expect(lerpBox(tile, round, 0)).toEqual(tile);
    expect(lerpBox(tile, round, 1)).toEqual(round);
    expect(lerpBox(tile, round, 0.5)).toEqual({
      x: 70,
      y: 130,
      width: 192,
      height: 192,
      radius: 60,
    });
  });

  it("starts on the source and rests on the destination", () => {
    const frames = flightKeyframes(tile, header, (t) => t, 4);
    expect(frames).toHaveLength(5);
    expect(frames[0]).toEqual({
      transform: `translate(60px, 140px) scale(${160 / 224})`,
      borderRadius: `${8 / (160 / 224)}px`,
    });
    expect(frames[4]).toEqual({ transform: "translate(0px, 0px) scale(1)", borderRadius: "8px" });
  });

  it("keeps the radius on screen between the two ends while the scale changes", () => {
    const round = { ...header, radius: 112 };
    for (const frame of flightKeyframes(tile, round, (t) => t, 8)) {
      const scale = Number(/scale\(([^)]+)\)/.exec(String(frame.transform))![1]);
      const onScreen = Number.parseFloat(String(frame.borderRadius)) * scale;
      expect(onScreen).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(onScreen).toBeLessThanOrEqual(112 + 1e-9);
    }
  });
});

describe("departures", () => {
  it("are only for the screen that appears right after", () => {
    expect(isFresh(0, DEPARTURE_TTL_MS)).toBe(true);
    expect(isFresh(0, DEPARTURE_TTL_MS + 1)).toBe(false);
  });
});
