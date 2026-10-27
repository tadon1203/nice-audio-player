import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type QueueItem, type QueueState, UPCOMING_WINDOW } from "#lib/native/bindings";
import type { player } from "#lib/native/commands";
import type { Result } from "#lib/native/result";
import { Player } from "./player.svelte";
import { PlaybackClock } from "./playback-clock.svelte";

const RETRY_DELAY_MS = 1000;

function item(index: number): QueueItem {
  return { queueItemId: `item-${index}` } as unknown as QueueItem;
}

function windowAt(offset: number): { version: number; offset: number; items: QueueItem[] } {
  return { version: 1, offset, items: [item(offset)] };
}

/** A queue state with `total` upcoming items, none of them in the snapshot. */
function queueAt(version: number, total: number): QueueState {
  return { version, upcomingCount: total, upcoming: [] } as unknown as QueueState;
}

/** A player whose backend answers queue windows through `queueWindow`. */
function playerWith(queueWindow: (offset: number, limit: number) => Promise<unknown>): Player {
  const commands = { queueWindow } as unknown as typeof player;
  return new Player(commands, new PlaybackClock());
}

let cleanup: () => void;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
});

/** Follows the rows `start` to `end` on screen, as a mounted list does. */
function mount(playback: Player, start: number, end: number): void {
  cleanup = $effect.root(() => {
    playback.followUpcoming(() => ({ start, end }));
  });
  flushSync();
}

describe("Player upcoming items", () => {
  it("reads the chunk on screen and returns its items", async () => {
    const queueWindow = vi.fn(async (offset: number) => ({ ok: true, value: windowAt(offset) }));
    const playback = playerWith(queueWindow);
    playback.acceptQueue(queueAt(1, 250));
    mount(playback, UPCOMING_WINDOW, UPCOMING_WINDOW);

    await vi.advanceTimersByTimeAsync(0);

    expect(queueWindow).toHaveBeenCalledWith(UPCOMING_WINDOW, UPCOMING_WINDOW);
    expect(playback.upcomingAt(UPCOMING_WINDOW)).toEqual(item(UPCOMING_WINDOW));
  });

  it("retries a failed chunk after a delay until it arrives", async () => {
    const queueWindow = vi
      .fn<(offset: number, limit: number) => Promise<Result<ReturnType<typeof windowAt>>>>()
      .mockResolvedValueOnce({ ok: false, error: { code: "internal" } })
      .mockImplementation(async (offset) => ({ ok: true, value: windowAt(offset) }));
    const playback = playerWith(queueWindow);
    playback.acceptQueue(queueAt(1, 250));
    mount(playback, UPCOMING_WINDOW, UPCOMING_WINDOW);

    await vi.advanceTimersByTimeAsync(0);
    expect(queueWindow).toHaveBeenCalledTimes(1);
    expect(playback.upcomingAt(UPCOMING_WINDOW)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    expect(queueWindow).toHaveBeenCalledTimes(2);
    expect(playback.upcomingAt(UPCOMING_WINDOW)).toEqual(item(UPCOMING_WINDOW));
  });

  it("stops retrying after the last attempt and leaves the rows empty", async () => {
    const queueWindow = vi.fn(async (): Promise<Result<ReturnType<typeof windowAt>>> => ({
      ok: false,
      error: { code: "internal" },
    }));
    const playback = playerWith(queueWindow);
    playback.acceptQueue(queueAt(1, 250));
    mount(playback, UPCOMING_WINDOW, UPCOMING_WINDOW);

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 10);

    expect(queueWindow).toHaveBeenCalledTimes(3);
    expect(playback.upcomingAt(UPCOMING_WINDOW)).toBeUndefined();
  });

  it("reads the window again when the queue version changes", async () => {
    const queueWindow = vi.fn(async (offset: number) => ({ ok: true, value: windowAt(offset) }));
    const playback = playerWith(queueWindow);
    playback.acceptQueue(queueAt(1, 250));
    mount(playback, UPCOMING_WINDOW, UPCOMING_WINDOW);
    await vi.advanceTimersByTimeAsync(0);
    expect(queueWindow).toHaveBeenCalledTimes(1);

    playback.acceptQueue(queueAt(2, 250));
    flushSync();
    await vi.advanceTimersByTimeAsync(0);

    expect(queueWindow).toHaveBeenCalledTimes(2);
  });
});
