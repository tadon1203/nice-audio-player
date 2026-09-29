import { describe, expect, it } from "vitest";
import {
  discAngle,
  grooveRadius,
  grooveStrip,
  grooveWidth,
  seekSpin,
  SILENCE_PEAK,
} from "./groove-model";

const radiusOf = ([x, y]: readonly [number, number]) => Math.hypot(x, y);

describe("grooveRadius", () => {
  it("runs linearly from the outside to the inside", () => {
    expect(grooveRadius(0, 96, 42)).toBe(96);
    expect(grooveRadius(1, 96, 42)).toBe(42);
    expect(grooveRadius(0.5, 96, 42)).toBe(69);
    expect(grooveRadius(2, 96, 42)).toBe(42);
  });
});

describe("grooveWidth", () => {
  it("grows with the peak and never reaches the next turn", () => {
    expect(grooveWidth(0, 3)).toBeCloseTo(0.3);
    expect(grooveWidth(255, 3)).toBeCloseTo(2.4);
    expect(grooveWidth(128, 3)).toBeGreaterThan(grooveWidth(64, 3));
  });
});

describe("discAngle", () => {
  it("turns the whole spiral over the track", () => {
    expect(discAngle(0, 30)).toBe(0);
    expect(discAngle(0.5, 30)).toBe(5400);
    expect(discAngle(1, 30)).toBe(10800);
  });
});

describe("seekSpin", () => {
  it("is one turn plus the remainder, in the seek direction", () => {
    expect(seekSpin(0, 1000, 1)).toBe(640);
    expect(seekSpin(1000, 0, -1)).toBe(-640);
  });

  it("ends on the same angle as the real target", () => {
    const vis = seekSpin(200, 5000, 1);
    expect((((200 + vis) % 360) + 360) % 360).toBeCloseTo(5000 % 360);
    const back = seekSpin(5000, 200, -1);
    expect((((5000 + back) % 360) + 360) % 360).toBeCloseTo(200);
  });
});

describe("grooveStrip", () => {
  const loud = Array.from({ length: 1000 }, () => 200);

  it("spirals inward from the outer radius", () => {
    const [run] = grooveStrip(loud, 30, 96, 42);
    const centre = (i: number) => (radiusOf(run!.outer[i]!) + radiusOf(run!.inner[i]!)) / 2;
    expect(centre(0)).toBeCloseTo(96, 0);
    expect(centre(run!.outer.length - 1)).toBeCloseTo(42, 0);
    expect(centre(4000)).toBeGreaterThan(centre(8000));
  });

  it("is wider where the peak is louder", () => {
    const mixed = [
      ...Array.from({ length: 500 }, () => 40),
      ...Array.from({ length: 500 }, () => 250),
    ];
    const [run] = grooveStrip(mixed, 30, 96, 42);
    const gap = (i: number) => radiusOf(run!.outer[i]!) - radiusOf(run!.inner[i]!);
    expect(gap(9000)).toBeGreaterThan(gap(1000));
  });

  it("cuts the groove at silence, so a break is a dark ring", () => {
    const withBreak = [
      ...Array.from({ length: 400 }, () => 200),
      ...Array.from({ length: 200 }, () => SILENCE_PEAK - 1),
      ...Array.from({ length: 400 }, () => 200),
    ];
    expect(grooveStrip(withBreak, 30, 96, 42)).toHaveLength(2);
    expect(
      grooveStrip(
        Array.from({ length: 100 }, () => 0),
        30,
        96,
        42,
      ),
    ).toEqual([]);
  });

  it("puts time t under the needle once the disc has turned by discAngle(t)", () => {
    const [run] = grooveStrip(loud, 30, 96, 42, 360, [0.25, 0.25]);
    const [x, y] = run!.outer[0]!;
    const turned = (Math.atan2(y, x) * 180) / Math.PI + discAngle(0.25, 30);
    expect(((((turned + 180) % 360) + 360) % 360) - 180).toBeCloseTo(0, 3);
  });

  it("limits itself to a range of the track", () => {
    const whole = grooveStrip(loud, 30, 96, 42);
    const part = grooveStrip(loud, 30, 96, 42, 360, [0.5, 0.6]);
    expect(part[0]!.outer.length).toBeLessThan(whole[0]!.outer.length / 5);
    // The centre line is at 69; the outer edge is half a groove wider.
    expect(radiusOf(part[0]!.outer[0]!)).toBeGreaterThan(69);
    expect(radiusOf(part[0]!.outer[0]!)).toBeLessThan(70.5);
  });
});
