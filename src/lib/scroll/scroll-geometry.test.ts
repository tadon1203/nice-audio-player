import { describe, expect, it } from "vitest";
import { clampScrollTop, elementScrollTop } from "./scroll-geometry";

function container() {
  const el = { getBoundingClientRect: () => ({ top: 50, height: 200 }) } as unknown as HTMLElement;
  Object.defineProperties(el, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 200 },
    scrollTop: { writable: true, value: 100 },
  });
  return el;
}

describe("scroll geometry", () => {
  it("clamps absolute positions", () => {
    const el = container();
    expect(clampScrollTop(el, -20)).toBe(0);
    expect(clampScrollTop(el, 5000)).toBe(800);
  });
  it("aligns nested targets relative to the scroll container", () => {
    const el = container();
    const target = {
      getBoundingClientRect: () => ({ top: 250, height: 40 }),
    } as unknown as HTMLElement;
    expect(elementScrollTop(el, target, "start")).toBe(300);
    expect(elementScrollTop(el, target, "center")).toBe(220);
    expect(elementScrollTop(el, target, "end")).toBe(140);
  });
  it("does not move an already visible target for nearest", () => {
    const el = container();
    const target = {
      getBoundingClientRect: () => ({ top: 120, height: 40 }),
    } as unknown as HTMLElement;
    expect(elementScrollTop(el, target, "nearest")).toBe(100);
  });
});
