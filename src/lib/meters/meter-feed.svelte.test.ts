import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeterFrame } from "#lib/native/bindings";
import { meter } from "#lib/native/commands";
import { BAND_COUNT } from "./ballistics";
import { MeterFeed } from "./meter-feed.svelte";

const mocks = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock("#lib/native/commands", () => ({ meter: { start: mocks.start, stop: mocks.stop } }));

function frameWithPeak(peak: number): MeterFrame {
  return {
    bands: Array.from({ length: BAND_COUNT }, () => -40),
    peak: [peak, -60],
    rms: [-20, -20],
    clip: [false, false],
  };
}

/** The frame callback the last `meter.start` passed. */
let push: (frame: MeterFrame) => void;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.start.mockImplementation((onFrame: (frame: MeterFrame) => void) => {
    push = onFrame;
    return Promise.resolve(undefined);
  });
  mocks.stop.mockResolvedValue(undefined);
});

let cleanup: () => void;

afterEach(() => cleanup?.());

function mount(active: () => boolean, onFrame?: () => void): MeterFeed {
  let feed!: MeterFeed;
  cleanup = $effect.root(() => {
    feed = new MeterFeed(meter, active, onFrame);
  });
  flushSync();
  return feed;
}

describe("MeterFeed", () => {
  it("does not start while inactive", () => {
    mount(() => false);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("hands over the frames since the last drain, then none", () => {
    const onFrame = vi.fn();
    const feed = mount(() => true, onFrame);

    push(frameWithPeak(-6));
    push(frameWithPeak(-3));

    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(feed.drain().map((frame) => frame.peak[0])).toEqual([-6, -3]);
    expect(feed.drain()).toEqual([]);
  });

  it("stops when it turns inactive and ignores later frames", () => {
    let active = $state(true);
    const feed = mount(() => active);

    active = false;
    flushSync();
    push(frameWithPeak(-1));

    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(feed.drain()).toEqual([]);
  });

  it("stops when the owner is destroyed", () => {
    mount(() => true);

    cleanup();

    expect(mocks.stop).toHaveBeenCalledOnce();
  });
});
