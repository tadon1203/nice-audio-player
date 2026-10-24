import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type MeterClient } from "#lib/native/native-clients";
import { BAND_COUNT } from "./ballistics";
import { MeterFeed } from "./meter-feed.svelte";
import type { Mock } from "vitest";

const FRAME_BYTES = (BAND_COUNT + 5) * 4;

function wireFrame(peak: number): ArrayBuffer {
  const buffer = new ArrayBuffer(FRAME_BYTES);
  new DataView(buffer).setFloat32(BAND_COUNT * 4, peak, true);
  return buffer;
}

function fakeClient(): {
  client: MeterClient;
  subscribe: Mock<(onFrame: (frame: ArrayBuffer) => void) => Promise<Mock<() => Promise<void>>>>;
  stop: Mock<() => Promise<void>>;
  push: (frame: ArrayBuffer) => void;
} {
  const stop = vi.fn(() => Promise.resolve());
  let push: (frame: ArrayBuffer) => void = () => {};
  const subscribe = vi.fn((onFrame: (frame: ArrayBuffer) => void) => {
    push = onFrame;
    return Promise.resolve(stop);
  });
  const client: MeterClient = { subscribe };
  return { client, subscribe, stop, push: (frame: ArrayBuffer): void => push(frame) };
}

let cleanup: () => void;

afterEach(() => cleanup?.());

function mount(client: MeterClient, active: () => boolean, onFrame?: () => void): MeterFeed {
  let feed!: MeterFeed;
  cleanup = $effect.root(() => {
    feed = new MeterFeed(client, active, onFrame);
  });
  flushSync();
  return feed;
}

describe("MeterFeed", () => {
  it("does not subscribe while inactive", () => {
    const { client, subscribe } = fakeClient();
    mount(client, () => false);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("hands over the frames since the last drain, then none", () => {
    const { client, push } = fakeClient();
    const onFrame = vi.fn();
    const feed = mount(client, () => true, onFrame);

    push(wireFrame(-6));
    push(wireFrame(-3));

    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(feed.drain().map((frame) => frame.peak[0])).toEqual([-6, -3]);
    expect(feed.drain()).toEqual([]);
  });

  it("drops messages of the wrong size", () => {
    const { client, push } = fakeClient();
    const onFrame = vi.fn();
    const feed = mount(client, () => true, onFrame);

    push(new ArrayBuffer(3));

    expect(onFrame).not.toHaveBeenCalled();
    expect(feed.drain()).toEqual([]);
  });

  it("unsubscribes when it turns inactive and ignores later frames", async () => {
    const { client, stop, push } = fakeClient();
    let active = $state(true);
    const feed = mount(client, () => active);
    await Promise.resolve();

    active = false;
    flushSync();
    push(wireFrame(-1));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(feed.drain()).toEqual([]);
  });

  it("unsubscribes when the owner is destroyed", async () => {
    const { client, stop } = fakeClient();
    mount(client, () => true);
    await Promise.resolve();

    cleanup();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
