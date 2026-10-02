import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLyricsFollow } from "./lyrics-follow.svelte";

// The spring is replaced by a recorder: a scroll is "animated" when the spring is given a target.
// `current` is reactive so a test can move the spring by hand, as the animation frames would.
const glideTargets = vi.hoisted(() => [] as number[]);
const springs = vi.hoisted(() => [] as Array<{ current: number }>);
vi.mock("$lib/ui/motion/retargetable-spring.svelte", () => ({
  RetargetableSpring: class {
    current = $state(0);
    #target = 0;
    constructor(value: number) {
      this.current = value;
      this.#target = value;
      springs.push(this);
    }
    get target() {
      return this.#target;
    }
    set(value: number, options: { instant?: boolean } = {}) {
      this.#target = value;
      if (options.instant) this.current = value;
      else glideTargets.push(value);
    }
    stop() {}
  },
}));
vi.mock("$lib/shell/motion-budget.svelte", () => ({
  getMotionBudget: () => ({ current: "full" }),
}));

const LINE_COUNT = 40;
const LINE_HEIGHT = 40;

let index = $state(0);
let follow: ReturnType<typeof createLyricsFollow>;
let cleanup: () => void;
let scrollTops: number[];
let container: HTMLElement;
let stops: Array<() => void>;
let fadeAnimation: ReturnType<typeof vi.fn>;
let msToNextLine: number | null;

function mount(start: number) {
  index = start;
  container = document.createElement("div");
  fadeAnimation = vi.fn(() => ({ cancel: () => undefined }));
  Object.assign(container, { animate: fadeAnimation });
  Object.defineProperty(container, "clientHeight", { configurable: true, value: 400 });
  Object.defineProperty(container, "scrollHeight", {
    configurable: true,
    value: LINE_COUNT * LINE_HEIGHT,
  });
  Object.defineProperty(container, "scrollTop", {
    configurable: true,
    get: () => scrollTops.at(-1) ?? 0,
    set: (value: number) => scrollTops.push(value),
  });
  document.body.append(container);
  cleanup = $effect.root(() => {
    follow = createLyricsFollow(
      () => index,
      () => msToNextLine,
    );
    follow.container(container);
    for (let line = 0; line < LINE_COUNT; line += 1) {
      const element = document.createElement("div");
      Object.defineProperty(element, "offsetTop", {
        configurable: true,
        value: line * LINE_HEIGHT,
      });
      Object.defineProperty(element, "offsetHeight", { configurable: true, value: LINE_HEIGHT });
      follow.line(line)(element);
    }
  });
  flushSync();
}

function show(next: number) {
  index = next;
  flushSync();
}

/** The reader scrolls the list to `value`: a position none of our writes produced. */
function userScroll(value = 500) {
  scrollTops.push(value);
  follow.onscroll();
  flushSync();
}

/** Time passes; timers run and effects settle. */
function elapse(ms: number) {
  vi.advanceTimersByTime(ms);
  flushSync();
}

/** The current line is reported in or out of view by the intersection observer. */
function stubObserver(inView: boolean) {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private callback: (entries: Array<Record<string, unknown>>) => void) {}
      observe() {
        this.callback([
          {
            isIntersecting: inView,
            intersectionRatio: inView ? 1 : 0,
            boundingClientRect: { top: -50, bottom: -10 },
            rootBounds: { top: 0, bottom: 400 },
          },
        ]);
      }
      disconnect() {}
    },
  );
}

/** How many times the list was animated to a position (as opposed to set at once). */
function animatedScrolls() {
  return glideTargets.length;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  msToNextLine = null;
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  glideTargets.length = 0;
  scrollTops = [];
  stops = [];
});

afterEach(() => {
  cleanup();
  container.remove();
  vi.unstubAllGlobals();
  for (const stop of stops) stop();
  vi.useRealTimers();
});

describe("createLyricsFollow", () => {
  it("sets the position at once when it mounts", () => {
    mount(10);
    expect(animatedScrolls()).toBe(0);
    // Line 10's centre (10 * 40 + 20) at 40% of 400px.
    expect(scrollTops.at(-1)).toBe(10 * LINE_HEIGHT + LINE_HEIGHT / 2 - 160);
  });

  it("animates a step to the next line", () => {
    mount(10);
    show(11);
    expect(animatedScrolls()).toBe(1);
  });

  it("sets a large seek at once and fades the list in", () => {
    mount(2);
    show(7);
    expect(animatedScrolls()).toBe(0);
    expect(scrollTops.at(-1)).toBe(7 * LINE_HEIGHT + LINE_HEIGHT / 2 - 160);
    expect(fadeAnimation).toHaveBeenCalledOnce();
  });

  it("animates a seek of a few lines", () => {
    mount(10);
    show(8);
    expect(animatedScrolls()).toBe(1);
  });

  describe("the glide", () => {
    /** One animation frame: the spring is at `value`. */
    const frame = (value: number) => {
      springs.at(-1)!.current = value;
      flushSync();
    };

    it("follows the spring while it moves", () => {
      mount(10);
      show(11);
      frame(220);
      expect(scrollTops.at(-1)).toBe(220);
      frame(235);
      expect(scrollTops.at(-1)).toBe(235);
    });

    it("lands exactly on the target once within half a pixel, then lets go", () => {
      mount(10);
      show(11);
      const target = glideTargets.at(-1)!;
      frame(target - 0.3);
      expect(scrollTops.at(-1)).toBe(target);
      const writes = scrollTops.length;
      frame(target - 30);
      expect(scrollTops.length).toBe(writes);
    });

    it("stops at once on a scroll intent", () => {
      mount(10);
      show(11);
      frame(220);
      userScroll();
      const writes = scrollTops.length;
      frame(240);
      expect(scrollTops.length).toBe(writes);
    });

    it("lets go when something else moved the list", () => {
      mount(10);
      show(11);
      frame(220);
      scrollTops.push(500);
      const writes = scrollTops.length;
      frame(240);
      expect(scrollTops.length).toBe(writes);
    });
  });

  it("returns to follow on a seek", () => {
    mount(2);
    userScroll();
    expect(follow.mode).toBe("free");
    show(30);
    expect(follow.mode).toBe("follow");
  });

  describe("returning from free scrolling", () => {
    it("stays free a step before the wait ends", () => {
      stubObserver(true);
      mount(2);
      userScroll();
      elapse(1_999);
      expect(follow.mode).toBe("free");
    });

    it("returns once 2s have passed with the current line in view", () => {
      stubObserver(true);
      mount(2);
      userScroll();
      elapse(2_000);
      expect(follow.mode).toBe("follow");
    });

    it("waits 6s while the current line is out of view", () => {
      stubObserver(false);
      mount(2);
      userScroll();
      elapse(5_999);
      expect(follow.mode).toBe("free");
      elapse(1);
      expect(follow.mode).toBe("follow");
    });

    it("holds the wait while the pointer rests on the lyrics", () => {
      stubObserver(true);
      mount(2);
      follow.onpointerenter();
      userScroll();
      elapse(11_000);
      expect(follow.mode).toBe("free");
      follow.onpointerleave();
      flushSync();
      elapse(1_999);
      expect(follow.mode).toBe("free");
      elapse(1);
      expect(follow.mode).toBe("follow");
    });

    it("at the end of the wait waits for the line change when it is under 1s away", () => {
      stubObserver(true);
      mount(2);
      userScroll();
      msToNextLine = 999;
      elapse(2_000);
      expect(follow.mode).toBe("free");
      show(3);
      expect(follow.mode).toBe("follow");
    });

    it("returns at the end of the wait when the next line is 1s or more away", () => {
      stubObserver(true);
      mount(2);
      userScroll();
      msToNextLine = 1_000;
      elapse(2_000);
      expect(follow.mode).toBe("follow");
    });

    it("glides back within a viewport and fades from further away", () => {
      stubObserver(true);
      mount(10);
      userScroll(300);
      elapse(2_000);
      expect(animatedScrolls()).toBe(1);
      userScroll(1_000);
      elapse(2_000);
      expect(fadeAnimation).toHaveBeenCalledOnce();
    });

    it("returns at once when the reader scrolls the current line back to the anchor", () => {
      mount(10);
      userScroll(0);
      expect(follow.mode).toBe("free");
      userScroll(10 * LINE_HEIGHT + LINE_HEIGHT / 2 - 160 + 10);
      expect(follow.mode).toBe("follow");
    });

    it("stays free when the first scroll is still near the anchor", () => {
      mount(10);
      userScroll(10 * LINE_HEIGHT + LINE_HEIGHT / 2 - 160 + 5);
      expect(follow.mode).toBe("free");
    });
  });

  describe("what makes it free", () => {
    it("is not our own glide frames or instant writes", () => {
      mount(10);
      follow.onscroll();
      expect(follow.mode).toBe("follow");
      show(11);
      springs.at(-1)!.current = 220;
      flushSync();
      follow.onscroll();
      expect(follow.mode).toBe("follow");
    });

    it("is not a plain click", () => {
      mount(10);
      container.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      container.dispatchEvent(new Event("click", { bubbles: true }));
      expect(follow.mode).toBe("follow");
    });

    it("is not selecting text, which only pauses the auto-scroll", () => {
      mount(10);
      container.textContent = "some lyrics";
      document.getSelection()!.selectAllChildren(container);
      document.dispatchEvent(new Event("selectionchange"));
      flushSync();
      show(11);
      expect(follow.mode).toBe("follow");
      expect(animatedScrolls()).toBe(0);
      document.getSelection()!.removeAllRanges();
      document.dispatchEvent(new Event("selectionchange"));
      flushSync();
      expect(animatedScrolls()).toBe(1);
    });
  });

  it("realigns only while following", () => {
    mount(5);
    const before = scrollTops.length;
    follow.realign();
    expect(scrollTops.length).toBe(before + 1);
    userScroll();
    const after = scrollTops.length;
    follow.realign();
    expect(scrollTops.length).toBe(after);
  });
});
