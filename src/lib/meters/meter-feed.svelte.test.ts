import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { meter } from "#lib/native/commands";
import { BAND_COUNT } from "./ballistics";
import { MeterFeed } from "./meter-feed.svelte";

const mocks = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
vi.mock("#lib/native/commands", () => ({ meter: { start: mocks.start, stop: mocks.stop } }));

const FRAME_BYTES = (BAND_COUNT + 5) * 4;

function wireFrame(peak: number): ArrayBuffer {
  const buffer = new ArrayBuffer(FRAME_BYTES);
  new DataView(buffer).setFloat32(BAND_COUNT * 4, peak, true);
  return buffer;
}

/** The frame callback the last subscription passed to `meter.start`. */
let push: (frame: ArrayBuffer) => void;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.start.mockImplementation((onFrame: (frame: ArrayBuffer) => void) => {
    push = onFrame;
    return Promise.resolve(1);
  });
  mocks.stop.mockResolvedValue(null);
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
  it("does not subscribe while inactive", () => {
    mount(() => false);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("hands over the frames since the last drain, then none", () => {
    const onFrame = vi.fn();
    const feed = mount(() => true, onFrame);

    push(wireFrame(-6));
    push(wireFrame(-3));

    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(feed.drain().map((frame) => frame.peak[0])).toEqual([-6, -3]);
    expect(feed.drain()).toEqual([]);
  });

  it("drops messages of the wrong size", () => {
    const onFrame = vi.fn();
    const feed = mount(() => true, onFrame);

    push(new ArrayBuffer(3));

    expect(onFrame).not.toHaveBeenCalled();
    expect(feed.drain()).toEqual([]);
  });

  it("unsubscribes when it turns inactive and ignores later frames", async () => {
    let active = $state(true);
    const feed = mount(() => active);
    await Promise.resolve();

    active = false;
    flushSync();
    push(wireFrame(-1));

    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(mocks.stop).toHaveBeenCalledWith(1);
    expect(feed.drain()).toEqual([]);
  });

  it("unsubscribes when the owner is destroyed", async () => {
    mount(() => true);
    await Promise.resolve();

    cleanup();

    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(mocks.stop).toHaveBeenCalledWith(1);
  });
});
