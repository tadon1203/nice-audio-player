import { describe, expect, it } from "vitest";
import { anchorScrollTop } from "./anchor";
import {
  decideLineChange,
  isScrollIntentKey,
  offscreenSide,
  RETURN_TO_FOLLOW_MS,
} from "./lyrics-follow-model";

const base = { mode: "follow", now: 10_000, lastInteractionAt: 0 } as const;

describe("decideLineChange", () => {
  it("sets the position at once for the first line seen", () => {
    expect(decideLineChange({ ...base, previous: null, current: 10 })).toEqual({
      mode: "follow",
      scroll: "instant",
    });
  });

  it("does nothing when the line did not change", () => {
    expect(decideLineChange({ ...base, previous: 4, current: 4 }).scroll).toBeNull();
  });

  it("animates a step to the next line", () => {
    expect(decideLineChange({ ...base, previous: 10, current: 11 }).scroll).toBe("animate");
  });

  it("animates a seek of a few lines and returns to follow", () => {
    expect(decideLineChange({ ...base, previous: 10, current: 8 })).toEqual({
      mode: "follow",
      scroll: "animate",
    });
    expect(decideLineChange({ ...base, mode: "free", previous: 10, current: 13 })).toEqual({
      mode: "follow",
      scroll: "animate",
    });
  });

  it("sets a large seek at once and fades the list in", () => {
    expect(decideLineChange({ ...base, previous: 2, current: 7 })).toEqual({
      mode: "follow",
      scroll: "fade",
    });
  });

  it("returns to follow on a seek", () => {
    expect(decideLineChange({ ...base, mode: "free", previous: 2, current: 30 }).mode).toBe(
      "follow",
    );
  });

  it("returns to follow at a step once 3s have passed since the last interaction", () => {
    expect(
      decideLineChange({
        mode: "free",
        previous: 2,
        current: 3,
        now: RETURN_TO_FOLLOW_MS,
        lastInteractionAt: 0,
      }),
    ).toEqual({ mode: "follow", scroll: "animate" });
  });

  it("stays free at a step within 3s of the last interaction", () => {
    expect(
      decideLineChange({
        mode: "free",
        previous: 2,
        current: 3,
        now: RETURN_TO_FOLLOW_MS - 1,
        lastInteractionAt: 0,
      }),
    ).toEqual({ mode: "free", scroll: null });
  });
});

describe("offscreenSide", () => {
  const list = { top: 100, bottom: 500 };

  it("is null while the whole line is in view", () => {
    expect(offscreenSide({ top: 100, bottom: 140 }, list)).toBeNull();
  });

  it("names the side the line is cut off on", () => {
    expect(offscreenSide({ top: 90, bottom: 130 }, list)).toBe("above");
    expect(offscreenSide({ top: 480, bottom: 520 }, list)).toBe("below");
    expect(offscreenSide({ top: 600, bottom: 640 }, list)).toBe("below");
  });
});

describe("isScrollIntentKey", () => {
  it("recognises the keys that scroll a list", () => {
    for (const key of ["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]) {
      expect(isScrollIntentKey(key)).toBe(true);
    }
    expect(isScrollIntentKey("Escape")).toBe(false);
    expect(isScrollIntentKey("a")).toBe(false);
  });
});

describe("anchorScrollTop", () => {
  const list = { clientHeight: 400, scrollHeight: 40 * 40 };

  it("puts the centre of the row 40% from the top", () => {
    // Line 10's centre (10 * 40 + 20) at 40% of 400px.
    expect(anchorScrollTop({ ...list, rowTop: 400, rowHeight: 40 })).toBe(10 * 40 + 20 - 160);
  });

  it("stays inside the scroll range", () => {
    expect(anchorScrollTop({ ...list, rowTop: 0, rowHeight: 40 })).toBe(0);
    expect(anchorScrollTop({ ...list, rowTop: 1580, rowHeight: 40 })).toBe(1200);
  });
});
