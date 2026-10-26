import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type QueueItem, UPCOMING_WINDOW } from "#lib/native/bindings";
import type { Player } from "./player.svelte";
import { UpcomingItems } from "./upcoming-items.svelte";

const RETRY_DELAY_MS = 1000;

function item(index: number): QueueItem {
  return { queueItemId: `item-${index}` } as unknown as QueueItem;
}

function fakePlayback(total: number, fetchQueueWindow: Player["fetchQueueWindow"]): Player {
  return {
    queue: { upcomingCount: total, upcoming: [] },
    queueVersion: 1,
    fetchQueueWindow,
  } as unknown as Player;
}

/** A player whose queue version the test moves on, as the backend's queue changes do. */
function versionedPlayback(
  total: number,
  fetchQueueWindow: Player["fetchQueueWindow"],
): { playback: Player; bumpVersion: () => void } {
  const queue = $state({ version: 1 });
  const playback = {
    queue: { upcomingCount: total, upcoming: [] },
    get queueVersion(): number {
      return queue.version;
    },
    fetchQueueWindow,
  } as unknown as Player;
  return {
    playback,
    bumpVersion: (): void => {
      queue.version += 1;
    },
  };
}

function windowAt(offset: number): {
  version: number;
  offset: number;
  items: QueueItem[];
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

function mount(playback: Player, start: number, end: number): UpcomingItems {
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
    const upcoming = mount(fakePlayback(250, fetch), UPCOMING_WINDOW, UPCOMING_WINDOW);

    await vi.advanceTimersByTimeAsync(0);

    expect(fetch).toHaveBeenCalledWith(UPCOMING_WINDOW, UPCOMING_WINDOW);
    expect(upcoming.at(UPCOMING_WINDOW)).toEqual(item(UPCOMING_WINDOW));
  });

  it("retries a failed chunk after a delay until it arrives", async () => {
    const fetch = vi
      .fn<(offset: number, limit: number) => Promise<ReturnType<typeof windowAt>>>()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockImplementation(async (offset) => windowAt(offset));
    const upcoming = mount(fakePlayback(250, fetch), UPCOMING_WINDOW, UPCOMING_WINDOW);

    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(upcoming.at(UPCOMING_WINDOW)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(upcoming.at(UPCOMING_WINDOW)).toEqual(item(UPCOMING_WINDOW));
  });

  it("stops retrying after the last attempt and leaves the rows empty", async () => {
    const fetch = vi.fn(async (): Promise<ReturnType<typeof windowAt>> => {
      throw new Error("unavailable");
    });
    const upcoming = mount(fakePlayback(250, fetch), UPCOMING_WINDOW, UPCOMING_WINDOW);

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 10);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(upcoming.at(UPCOMING_WINDOW)).toBeUndefined();
  });

  it("reads the window again when the queue version changes", async () => {
    const fetch = vi.fn(async (offset: number) => windowAt(offset));
    const { playback, bumpVersion } = versionedPlayback(250, fetch);
    mount(playback, UPCOMING_WINDOW, UPCOMING_WINDOW);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    bumpVersion();
    flushSync();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
