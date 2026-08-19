import { describe, expect, it } from "vitest";
import { spring } from "motion";
import { spatialIndicator, spatialStructural } from "./motion";

function sample(profile: typeof spatialStructural | typeof spatialIndicator) {
  const generator = spring({ keyframes: [0, 100], ...profile });
  const values: number[] = [];
  let elapsed = 0;
  let done = false;
  while (!done && elapsed <= 1_000) {
    const result = generator.next(elapsed);
    values.push(result.value);
    done = result.done;
    if (!done) elapsed += 1;
  }
  return { elapsed, values, done };
}

describe("shared spatial motion", () => {
  it.each([
    ["structural", spatialStructural, 400],
    ["indicator", spatialIndicator, 300],
  ] as const)("keeps the %s spring critically damped and bounded", (_name, profile, limit) => {
    expect(profile.damping).toBeCloseTo(2 * Math.sqrt(profile.stiffness * profile.mass), 10);
    const result = sample(profile);
    expect(result.done).toBe(true);
    expect(result.elapsed).toBeLessThanOrEqual(limit);
    expect(Math.min(...result.values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...result.values)).toBeLessThanOrEqual(100);
    expect(result.values[result.values.length - 1]).toBe(100);
  });

  it("settles the frequent indicator before structural movement", () => {
    expect(sample(spatialIndicator).elapsed).toBeLessThan(sample(spatialStructural).elapsed);
  });
});
