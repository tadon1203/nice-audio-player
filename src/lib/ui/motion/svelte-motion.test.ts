import { beforeEach, describe, expect, it, vi } from "vitest";

const reduced = vi.hoisted(() => ({ current: false }));
vi.mock("svelte/motion", () => ({ prefersReducedMotion: reduced }));

import { motionFor } from "./svelte-motion";
import { settlingLength } from "./spring-curve";
import { motionTokens } from "./tokens";

const tokens = Object.keys(motionTokens) as (keyof typeof motionTokens)[];

describe("motionFor", () => {
  beforeEach(() => {
    reduced.current = false;
  });

  it("gives each token its settling length and an easing that runs from 0 to 1", () => {
    for (const token of tokens) {
      const { easing, duration } = motionFor(token);
      expect(duration).toBe(settlingLength(motionTokens[token].duration));
      expect(easing(0)).toBe(0);
      expect(easing(1)).toBe(1);
    }
  });

  it("makes every token the same 100ms crossfade under reduced motion", () => {
    reduced.current = true;
    for (const token of tokens) expect(motionFor(token).duration).toBe(100);
  });
});
