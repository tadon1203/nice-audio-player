import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RETURN_TO_FOLLOW_MS } from "./lyrics-follow-model";
import { createLyricsFollow } from "./lyrics-follow.svelte";

// The spring is replaced by a recorder: a scroll is "animated" when the spring is given a target.
const glideTargets = vi.hoisted(() => [] as number[]);
vi.mock("svelte/motion", () => ({
  Spring: class {
    current: number;
    #target: number;
    constructor(value: number) {
      this.current = value;
      this.#target = value;
    }
    get target() {
      return this.#target;
    }
    set target(value: number) {
      this.#target = value;
      glideTargets.push(value);
    }
    set(value: number) {
      this.current = value;
      this.#target = value;
      return Promise.resolve();
    }
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
  cleanup = $effect.root(() => {
    follow = createLyricsFollow(() => index);
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

/** How many times the list was animated to a position (as opposed to set at once). */
function animatedScrolls() {
  return glideTargets.length;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  glideTargets.length = 0;
  scrollTops = [];
  stops = [];
});

afterEach(() => {
  cleanup();
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

  it("returns to follow on a seek", () => {
    mount(2);
    follow.onwheel();
    expect(follow.mode).toBe("free");
    show(30);
    expect(follow.mode).toBe("follow");
  });

  it("returns to follow at a step once 3s have passed since the last interaction", () => {
    mount(2);
    follow.onwheel();
    vi.setSystemTime(Date.now() + RETURN_TO_FOLLOW_MS);
    show(3);
    expect(follow.mode).toBe("follow");
  });

  it("stays free at a step within 3s of the last interaction", () => {
    mount(2);
    follow.onwheel();
    vi.setSystemTime(Date.now() + RETURN_TO_FOLLOW_MS - 1);
    show(3);
    expect(follow.mode).toBe("free");
  });

  it("realigns only while following", () => {
    mount(5);
    const before = scrollTops.length;
    follow.realign();
    expect(scrollTops.length).toBe(before + 1);
    follow.onwheel();
    follow.realign();
    expect(scrollTops.length).toBe(before + 1);
  });
});
