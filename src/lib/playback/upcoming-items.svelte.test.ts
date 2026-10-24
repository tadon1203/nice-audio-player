import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type PlaybackQueueItem } from "#lib/native/bindings";
import type { Playback } from "./playback.svelte";
import { UpcomingItems } from "./upcoming-items.svelte";

const CHUNK = 100;
const RETRY_DELAY_MS = 1000;

function item(index: number): PlaybackQueueItem {
  return { queueItemId: `item-${index}` } as unknown as PlaybackQueueItem;
}

function fakePlayback(total: number, fetchQueueWindow: Playback["fetchQueueWindow"]): Playback {
  return {
    queue: { upcomingCount: total, upcoming: [] },
    queueVersion: 1,
    fetchQueueWindow,
  } as unknown as Playback;
}

function windowAt(offset: number): {
  version: number;
  offset: number;
  items: PlaybackQueueItem[];
} {
  return { version: 1, offset, items: [item(offset)] };
}

let cleanup: () => void;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
});

function mount(playback: Playback, start: number, end: number): UpcomingItems {
  let upcoming!: UpcomingItems;
  cleanup = $effect.root(() => {
    upcoming = new UpcomingItems(playback, () => ({ start, end }));
  });
  flushSync();
  return upcoming;
}

describe("UpcomingItems", () => {
  it("reads the chunk on screen and returns its items", async () => {
    const fetch = vi.fn(async (offset: number) => windowAt(offset));
    const upcoming = mount(fakePlayback(250, fetch), CHUNK, CHUNK);

    await vi.advanceTimersByTimeAsync(0);

    expect(fetch).toHaveBeenCalledWith(CHUNK, CHUNK);
    expect(upcoming.at(CHUNK)).toEqual(item(CHUNK));
  });

  it("retries a failed chunk after a delay until it arrives", async () => {
    const fetch = vi
      .fn<(offset: number, limit: number) => Promise<ReturnType<typeof windowAt>>>()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockImplementation(async (offset) => windowAt(offset));
    const upcoming = mount(fakePlayback(250, fetch), CHUNK, CHUNK);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(upcoming.at(CHUNK)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(upcoming.at(CHUNK)).toEqual(item(CHUNK));
  });

  it("stops retrying after the last attempt and leaves the rows empty", async () => {
    const fetch = vi.fn(async (): Promise<ReturnType<typeof windowAt>> => {
      throw new Error("unavailable");
    });
    const upcoming = mount(fakePlayback(250, fetch), CHUNK, CHUNK);

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 10);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(upcoming.at(CHUNK)).toBeUndefined();
  });
});
