import { describe, expect, it } from "vitest";
import {
  MAX_WAIT_FRAMES,
  recallScroll,
  rememberScroll,
  scrollWhenReachable,
  type FrameScheduler,
} from "./workspace-scroll-model";

/** A scroll region whose scrollTop is clamped to its content, as in a browser. */
function region(contentHeight: number, clientHeight = 500) {
  const state = { contentHeight, scrollTop: 0 };
  return {
    state,
    get scrollHeight() {
      return state.contentHeight;
    },
    clientHeight,
    get scrollTop() {
      return state.scrollTop;
    },
    set scrollTop(value: number) {
      state.scrollTop = Math.max(0, Math.min(value, state.contentHeight - clientHeight));
    },
  };
}

function manualFrames() {
  const pending = new Map<number, () => void>();
  let next = 1;
  const scheduler: FrameScheduler = {
    request: (callback) => {
      pending.set(next, callback);
      return next++;
    },
    cancel: (handle) => void pending.delete(handle),
  };
  return {
    scheduler,
    get waiting() {
      return pending.size;
    },
    tick() {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

describe("scroll memory", () => {
  it("recalls 0 for an unseen key and the last offset otherwise", () => {
    expect(recallScroll("/library/never")).toBe(0);
    rememberScroll("/library/albums", 120);
    rememberScroll("/library/albums", 480);
    expect(recallScroll("/library/albums")).toBe(480);
    expect(recallScroll("/library/tracks")).toBe(0);
  });
});

describe("scrollWhenReachable", () => {
  it("is clamped when set before the content has grown (the Album Artist restore)", () => {
    const short = region(600);
    short.scrollTop = 2000;
    expect(short.scrollTop).toBe(100);
  });

  it("waits for the content to grow, then lands on the offset", () => {
    const content = region(600);
    const frames = manualFrames();
    scrollWhenReachable(content, 2000, frames.scheduler);
    expect(content.scrollTop).toBe(0);
    frames.tick();
    content.state.contentHeight = 4000;
    frames.tick();
    expect(content.scrollTop).toBe(2000);
    expect(frames.waiting).toBe(0);
  });

  it("applies at once when the offset is already reachable", () => {
    const content = region(4000);
    scrollWhenReachable(content, 1500, manualFrames().scheduler);
    expect(content.scrollTop).toBe(1500);
  });

  it("settles for the end of the content after waiting long enough", () => {
    const content = region(600);
    const frames = manualFrames();
    scrollWhenReachable(content, 2000, frames.scheduler);
    for (let i = 0; i <= MAX_WAIT_FRAMES; i++) frames.tick();
    expect(content.scrollTop).toBe(100);
    expect(frames.waiting).toBe(0);
  });

  it("stops waiting when cancelled", () => {
    const content = region(600);
    const frames = manualFrames();
    const cancel = scrollWhenReachable(content, 2000, frames.scheduler);
    cancel();
    content.state.contentHeight = 4000;
    frames.tick();
    expect(content.scrollTop).toBe(0);
  });
});
