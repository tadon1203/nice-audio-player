import { describe, expect, it } from "vitest";
import { anchorScrollTop } from "./anchor-column";
import {
  decideLineChange,
  isNearAnchor,
  offscreenSide,
  POINTER_REST_CAP_MS,
  returnScroll,
  returnsAtWaitEnd,
  waitEndsAt,
  WAIT_IN_VIEW_MS,
  WAIT_OUT_OF_VIEW_MS,
} from "./lyrics-follow-model";

const base = { mode: "follow", now: 10_000, waitEndsAt: 0, selecting: false } as const;

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

  it("returns to follow at a step once the wait is over", () => {
    expect(
      decideLineChange({
        ...base,
        mode: "free",
        previous: 2,
        current: 3,
        now: 5_000,
        waitEndsAt: 5_000,
      }),
    ).toEqual({ mode: "follow", scroll: "animate" });
  });

  it("stays free at a step before the wait is over", () => {
    expect(
      decideLineChange({
        ...base,
        mode: "free",
        previous: 2,
        current: 3,
        now: 4_999,
        waitEndsAt: 5_000,
      }),
    ).toEqual({ mode: "free", scroll: null });
  });

  it("pauses at a step while text is selected, without becoming free", () => {
    expect(decideLineChange({ ...base, selecting: true, previous: 2, current: 3 })).toEqual({
      mode: "follow",
      scroll: null,
    });
  });

  it("still follows a seek while text is selected", () => {
    expect(decideLineChange({ ...base, selecting: true, previous: 2, current: 30 }).scroll).toBe(
      "fade",
    );
  });
});

describe("waitEndsAt", () => {
  it("is 2s after the last activity while the current line is in view", () => {
    expect(waitEndsAt({ idleSince: 100, pointerResting: false, currentInView: true })).toBe(
      100 + WAIT_IN_VIEW_MS,
    );
  });

  it("is 6s while the current line is out of view", () => {
    expect(waitEndsAt({ idleSince: 100, pointerResting: false, currentInView: false })).toBe(
      100 + WAIT_OUT_OF_VIEW_MS,
    );
  });

  it("does not count a resting pointer, but only up to the cap", () => {
    expect(waitEndsAt({ idleSince: 0, pointerResting: true, currentInView: true })).toBe(
      POINTER_REST_CAP_MS + WAIT_IN_VIEW_MS,
    );
  });
});

describe("returnsAtWaitEnd", () => {
  it("returns at once when no line change is coming or it is 1s or more away", () => {
    expect(returnsAtWaitEnd(null)).toBe(true);
    expect(returnsAtWaitEnd(1_000)).toBe(true);
  });

  it("waits for the line change when it is under 1s away", () => {
    expect(returnsAtWaitEnd(999)).toBe(false);
  });
});

describe("returnScroll", () => {
  it("glides within one viewport height and fades beyond it", () => {
    expect(returnScroll(-400, 400)).toBe("animate");
    expect(returnScroll(401, 400)).toBe("fade");
  });
});

describe("isNearAnchor", () => {
  it("is true within one line of the anchor position", () => {
    expect(isNearAnchor(460, 400, 60)).toBe(true);
    expect(isNearAnchor(340, 400, 60)).toBe(true);
    expect(isNearAnchor(461, 400, 60)).toBe(false);
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
