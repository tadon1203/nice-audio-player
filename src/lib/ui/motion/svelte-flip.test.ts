import { beforeEach, describe, expect, it, vi } from "vitest";

const reduced = vi.hoisted(() => ({ current: false }));
vi.mock("svelte/motion", () => ({ prefersReducedMotion: reduced }));

import { flipMotion } from "./svelte-flip";

const rect = (x: number) => ({ left: x, top: 0, width: 10, height: 10 }) as DOMRect;
const node = { clientWidth: 10, clientHeight: 10, parentElement: null } as unknown as Element;

describe("flipMotion", () => {
  beforeEach(() => {
    reduced.current = false;
    vi.stubGlobal("getComputedStyle", () => ({
      transform: "none",
      transformOrigin: "0px 0px",
      opacity: "1",
    }));
  });

  it("travels to the new place", () => {
    const config = flipMotion(node, { from: rect(0), to: rect(100) });
    expect(String((config as { css: (t: number, u: number) => string }).css(0, 1))).toContain(
      "translate",
    );
  });

  it("is a plain crossfade under reduced motion", () => {
    reduced.current = true;
    const config = flipMotion(node, { from: rect(0), to: rect(100) }, { delay: 50 });
    expect(config.duration).toBe(100);
    expect((config as { css: (t: number) => string }).css(0.5)).toBe("opacity: 0.5");
  });
});
