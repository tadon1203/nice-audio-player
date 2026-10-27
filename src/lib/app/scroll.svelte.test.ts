import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_WAIT_FRAMES, ScrollOffsets, WorkspaceScroll } from "./scroll.svelte";

describe("ScrollOffsets lists", () => {
  it("recalls 0 for an unseen path and the last offset otherwise", () => {
    const offsets = new ScrollOffsets();
    expect(offsets.recallList("/library/never")).toBe(0);
    offsets.rememberList("/library/albums", 120);
    offsets.rememberList("/library/albums", 480);
    expect(offsets.recallList("/library/albums")).toBe(480);
    expect(offsets.recallList("/library/tracks")).toBe(0);
  });

  it("keeps each instance's offsets apart", () => {
    const first = new ScrollOffsets();
    const second = new ScrollOffsets();
    first.rememberList("/library/albums", 300);
    expect(second.recallList("/library/albums")).toBe(0);
  });
});

describe("ScrollOffsets.detailSnapshot", () => {
  it("reads the offset when the history entry is left and writes it back when restored", () => {
    const offsets = new ScrollOffsets();
    let offset = 640;
    const write = vi.fn((next: number) => {
      offset = next;
    });
    const snapshot = offsets.detailSnapshot(() => offset, write);

    expect(snapshot.capture()).toBe(640);
    snapshot.restore(90);
    expect(write).toHaveBeenCalledWith(90);
    expect(offset).toBe(90);
  });
});

/** A scroll region whose scrollTop is clamped to its content, as in a browser. */
function region(
  contentHeight: number,
  clientHeight = 500,
): {
  state: { contentHeight: number; scrollTop: number };
  readonly scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
} {
  const state = { contentHeight, scrollTop: 0 };
  return {
    state,
    get scrollHeight(): number {
      return state.contentHeight;
    },
    clientHeight,
    get scrollTop(): number {
      return state.scrollTop;
    },
    set scrollTop(value: number) {
      state.scrollTop = Math.max(0, Math.min(value, state.contentHeight - clientHeight));
    },
  };
}

/** Replaces the global animation frames with a queue that the test runs by hand. */
function manualFrames(): { readonly waiting: number; tick(): void } {
  const pending = new Map<number, FrameRequestCallback>();
  let next = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    pending.set(next, callback);
    return next++;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    pending.delete(handle);
  });
  return {
    get waiting(): number {
      return pending.size;
    },
    tick(): void {
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback(0));
    },
  };
}

describe("WorkspaceScroll.scrollWhenReachable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is clamped when set before the content has grown (the Album Artist restore)", () => {
    const short = region(600);
    short.scrollTop = 2000;
    expect(short.scrollTop).toBe(100);
  });

  it("waits for the content to grow, then lands on the offset", () => {
    const content = region(600);
    const frames = manualFrames();
    WorkspaceScroll.scrollWhenReachable(content, 2000);
    expect(content.scrollTop).toBe(0);
    frames.tick();
    content.state.contentHeight = 4000;
    frames.tick();
    expect(content.scrollTop).toBe(2000);
    expect(frames.waiting).toBe(0);
  });

  it("applies at once when the offset is already reachable", () => {
    manualFrames();
    const content = region(4000);
    WorkspaceScroll.scrollWhenReachable(content, 1500);
    expect(content.scrollTop).toBe(1500);
  });

  it("settles for the end of the content after waiting long enough", () => {
    const content = region(600);
    const frames = manualFrames();
    WorkspaceScroll.scrollWhenReachable(content, 2000);
    for (let i = 0; i <= MAX_WAIT_FRAMES; i++) frames.tick();
    expect(content.scrollTop).toBe(100);
    expect(frames.waiting).toBe(0);
  });

  it("stops waiting when cancelled", () => {
    const content = region(600);
    const frames = manualFrames();
    const cancel = WorkspaceScroll.scrollWhenReachable(content, 2000);
    cancel();
    content.state.contentHeight = 4000;
    frames.tick();
    expect(content.scrollTop).toBe(0);
  });
});
