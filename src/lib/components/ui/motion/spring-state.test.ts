import { describe, expect, it } from "vitest";
import { SpringState } from "./spring-state";

const DURATION = 300;

describe("SpringState", () => {
  it("rests on its value", () => {
    const spring = SpringState.resting(5, DURATION);
    expect(spring.sample(1000)).toEqual({ value: 5, velocity: 0 });
    expect(spring.isSettled(0, 0.01)).toBe(true);
  });

  it("moves to the target without overshooting", () => {
    const spring = SpringState.resting(0, DURATION).retarget(100, 0);
    let last = 0;
    for (let ms = 0; ms <= 3000; ms += 4) {
      const { value } = spring.sample(ms);
      expect(value).toBeGreaterThanOrEqual(last);
      expect(value).toBeLessThanOrEqual(100);
      last = value;
    }
    expect(last).toBeCloseTo(100, 3);
  });

  it("is the same at any sampling rate", () => {
    const spring = SpringState.resting(0, DURATION).retarget(100, 0);
    // Sampling every frame at 144Hz or every frame at 60Hz lands on the same value.
    expect(spring.sample(1000).value).toBe(spring.sample(1000).value);
    const direct = spring.sample(250).value;
    let now = 0;
    while (now < 250) now += 250 / 36;
    expect(spring.sample(now).value).toBeCloseTo(direct, 6);
  });

  it("keeps its velocity when retargeted mid-flight", () => {
    const first = SpringState.resting(0, DURATION).retarget(100, 0);
    const before = first.sample(120);
    const second = first.retarget(40, 120);
    const after = second.sample(120);
    expect(after.value).toBeCloseTo(before.value, 9);
    expect(after.velocity).toBeCloseTo(before.velocity, 9);
    expect(before.velocity).toBeGreaterThan(0);
  });

  it("turns around without overshooting the new target", () => {
    const first = SpringState.resting(0, DURATION).retarget(100, 0);
    const second = first.retarget(0, 100);
    for (let ms = 100; ms <= 2000; ms += 4) {
      expect(second.sample(ms).value).toBeGreaterThanOrEqual(0);
    }
  });

  it("stops once it looks stopped, long before the value reaches the target exactly", () => {
    const spring = SpringState.resting(0, DURATION).retarget(100, 0);
    expect(spring.isSettled(100, 0.25)).toBe(false);
    expect(spring.isSettled(800, 0.25)).toBe(true);
    expect(spring.isSettled(500, 0.0001)).toBe(false);
  });

  it("jumps to a value at rest", () => {
    const moving = SpringState.resting(0, DURATION).retarget(100, 0);
    const jumped = moving.jump(7, 50);
    expect(jumped.sample(50)).toEqual({ value: 7, velocity: 0 });
    expect(jumped.isSettled(50, 0.01)).toBe(true);
  });

  it("changes pace on a retarget", () => {
    const rest = SpringState.resting(0, 400);
    const slow = rest.retarget(100, 0);
    const fast = rest.retarget(100, 0, 200);
    expect(fast.sample(150).value).toBeGreaterThan(slow.sample(150).value);
  });
});
