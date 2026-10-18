import { describe, expect, it } from "vitest";
import { LyricsFollowRules } from "./lyrics-follow-rules";

const base = { mode: "follow", now: 10_000, waitEndsAt: 0, selecting: false } as const;

describe("LyricsFollowRules.decideLineChange", () => {
  it("sets the position at once for the first line seen", () => {
    expect(LyricsFollowRules.decideLineChange({ ...base, previous: null, current: 10 })).toEqual({
      mode: "follow",
      scroll: "instant",
    });
  });

  it("does nothing when the line did not change", () => {
    expect(
      LyricsFollowRules.decideLineChange({ ...base, previous: 4, current: 4 }).scroll,
    ).toBeNull();
  });

  it("animates a step to the next line", () => {
    expect(LyricsFollowRules.decideLineChange({ ...base, previous: 10, current: 11 }).scroll).toBe(
      "animate",
    );
  });

  it("animates a seek of a few lines and returns to follow", () => {
    expect(LyricsFollowRules.decideLineChange({ ...base, previous: 10, current: 8 })).toEqual({
      mode: "follow",
      scroll: "animate",
    });
    expect(
      LyricsFollowRules.decideLineChange({ ...base, mode: "free", previous: 10, current: 13 }),
    ).toEqual({ mode: "follow", scroll: "animate" });
  });

  it("sets a large seek at once and fades the list in", () => {
    expect(LyricsFollowRules.decideLineChange({ ...base, previous: 2, current: 7 })).toEqual({
      mode: "follow",
      scroll: "fade",
    });
  });

  it("returns to follow on a seek", () => {
    expect(
      LyricsFollowRules.decideLineChange({ ...base, mode: "free", previous: 2, current: 30 }).mode,
    ).toBe("follow");
  });

  it("returns to follow at a step once the wait is over", () => {
    expect(
      LyricsFollowRules.decideLineChange({
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
      LyricsFollowRules.decideLineChange({
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
    expect(
      LyricsFollowRules.decideLineChange({ ...base, selecting: true, previous: 2, current: 3 }),
    ).toEqual({ mode: "follow", scroll: null });
  });

  it("still follows a seek while text is selected", () => {
    expect(
      LyricsFollowRules.decideLineChange({ ...base, selecting: true, previous: 2, current: 30 })
        .scroll,
    ).toBe("fade");
  });
});

describe("LyricsFollowRules.waitEndsAt", () => {
  it("is 2s after the last activity while the current line is in view", () => {
    expect(
      LyricsFollowRules.waitEndsAt({ idleSince: 100, pointerResting: false, currentInView: true }),
    ).toBe(100 + LyricsFollowRules.waitInViewMs);
  });

  it("is 6s while the current line is out of view", () => {
    expect(
      LyricsFollowRules.waitEndsAt({ idleSince: 100, pointerResting: false, currentInView: false }),
    ).toBe(100 + LyricsFollowRules.waitOutOfViewMs);
  });

  it("does not count a resting pointer, but only up to the cap", () => {
    expect(
      LyricsFollowRules.waitEndsAt({ idleSince: 0, pointerResting: true, currentInView: true }),
    ).toBe(LyricsFollowRules.pointerRestCapMs + LyricsFollowRules.waitInViewMs);
  });
});

describe("LyricsFollowRules.returnsAtWaitEnd", () => {
  it("returns at once when no line change is coming or it is 1s or more away", () => {
    expect(LyricsFollowRules.returnsAtWaitEnd(null)).toBe(true);
    expect(LyricsFollowRules.returnsAtWaitEnd(1_000)).toBe(true);
  });

  it("waits for the line change when it is under 1s away", () => {
    expect(LyricsFollowRules.returnsAtWaitEnd(999)).toBe(false);
  });
});

describe("LyricsFollowRules.returnScroll", () => {
  it("glides within one viewport height and fades beyond it", () => {
    expect(LyricsFollowRules.returnScroll(-400, 400)).toBe("animate");
    expect(LyricsFollowRules.returnScroll(401, 400)).toBe("fade");
  });
});

describe("LyricsFollowRules.isNearAnchor", () => {
  it("is true within one line of the anchor position", () => {
    expect(LyricsFollowRules.isNearAnchor(460, 400, 60)).toBe(true);
    expect(LyricsFollowRules.isNearAnchor(340, 400, 60)).toBe(true);
    expect(LyricsFollowRules.isNearAnchor(461, 400, 60)).toBe(false);
  });
});

describe("LyricsFollowRules.offscreenSide", () => {
  const list = { top: 100, bottom: 500 };

  it("is null while the whole line is in view", () => {
    expect(LyricsFollowRules.offscreenSide({ top: 100, bottom: 140 }, list)).toBeNull();
  });

  it("names the side the line is cut off on", () => {
    expect(LyricsFollowRules.offscreenSide({ top: 90, bottom: 130 }, list)).toBe("above");
    expect(LyricsFollowRules.offscreenSide({ top: 480, bottom: 520 }, list)).toBe("below");
    expect(LyricsFollowRules.offscreenSide({ top: 600, bottom: 640 }, list)).toBe("below");
  });
});
