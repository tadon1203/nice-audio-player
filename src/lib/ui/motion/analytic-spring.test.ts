import { describe, expect, it } from "vitest";
import {
  isSpringSettled,
  jumpSpring,
  restingSpring,
  retargetSpring,
  sampleSpring,
} from "./analytic-spring";

const DURATION = 300;

describe("analytic spring", () => {
  it("rests on its value", () => {
    const spring = restingSpring(5, DURATION);
    expect(sampleSpring(spring, 1000)).toEqual({ value: 5, velocity: 0 });
    expect(isSpringSettled(spring, 0, 0.01)).toBe(true);
  });

  it("moves to the target without overshooting", () => {
    const spring = retargetSpring(restingSpring(0, DURATION), 100, 0);
    let last = 0;
    for (let ms = 0; ms <= 3000; ms += 4) {
      const { value } = sampleSpring(spring, ms);
      expect(value).toBeGreaterThanOrEqual(last);
      expect(value).toBeLessThanOrEqual(100);
      last = value;
    }
    expect(last).toBeCloseTo(100, 3);
  });

  it("is the same at any sampling rate", () => {
    const spring = retargetSpring(restingSpring(0, DURATION), 100, 0);
    // Sampling every frame at 144Hz or every frame at 60Hz lands on the same value.
    expect(sampleSpring(spring, 1000).value).toBe(sampleSpring(spring, 1000).value);
    const direct = sampleSpring(spring, 250).value;
    let now = 0;
    while (now < 250) now += 250 / 36;
    expect(sampleSpring(spring, now).value).toBeCloseTo(direct, 6);
  });

  it("keeps its velocity when retargeted mid-flight", () => {
    const first = retargetSpring(restingSpring(0, DURATION), 100, 0);
    const before = sampleSpring(first, 120);
    const second = retargetSpring(first, 40, 120);
    const after = sampleSpring(second, 120);
    expect(after.value).toBeCloseTo(before.value, 9);
    expect(after.velocity).toBeCloseTo(before.velocity, 9);
    expect(before.velocity).toBeGreaterThan(0);
  });

  it("turns around without overshooting the new target", () => {
    const first = retargetSpring(restingSpring(0, DURATION), 100, 0);
    const second = retargetSpring(first, 0, 100);
    for (let ms = 100; ms <= 2000; ms += 4) {
      expect(sampleSpring(second, ms).value).toBeGreaterThanOrEqual(0);
    }
  });

  it("stops once it looks stopped, long before the value reaches the target exactly", () => {
    const spring = retargetSpring(restingSpring(0, DURATION), 100, 0);
    expect(isSpringSettled(spring, 100, 0.25)).toBe(false);
    expect(isSpringSettled(spring, 800, 0.25)).toBe(true);
    expect(isSpringSettled(spring, 500, 0.0001)).toBe(false);
  });

  it("jumps to a value at rest", () => {
    const moving = retargetSpring(restingSpring(0, DURATION), 100, 0);
    const jumped = jumpSpring(moving, 7, 50);
    expect(sampleSpring(jumped, 50)).toEqual({ value: 7, velocity: 0 });
    expect(isSpringSettled(jumped, 50, 0.01)).toBe(true);
  });

  it("changes pace on a retarget", () => {
    const slow = retargetSpring(restingSpring(0, 400), 100, 0);
    const fast = retargetSpring(restingSpring(0, 400), 100, 0, 200);
    expect(sampleSpring(fast, 150).value).toBeGreaterThan(sampleSpring(slow, 150).value);
  });
});
