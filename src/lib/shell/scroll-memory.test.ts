import { describe, expect, it } from "vitest";
import { captureScroll, recallScroll, rememberScroll, restoreScroll } from "./scroll-memory";

describe("scroll memory", () => {
  it("recalls 0 for an unseen key and the last offset otherwise", () => {
    expect(recallScroll("/library/never")).toBe(0);
    rememberScroll("/library/albums", 120);
    rememberScroll("/library/albums", 480);
    expect(recallScroll("/library/albums")).toBe(480);
    expect(recallScroll("/library/tracks")).toBe(0);
  });

  it("captures and restores a viewport's scrollTop", () => {
    const viewport = document.createElement("div");
    viewport.scrollTo = ((options: ScrollToOptions) => {
      viewport.scrollTop = options.top ?? 0;
    }) as typeof viewport.scrollTo;
    restoreScroll(viewport, 300);
    expect(captureScroll(viewport)).toBe(300);
    expect(captureScroll(null)).toBe(0);
  });
});
