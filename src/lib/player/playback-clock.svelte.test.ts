import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackClock, type ClockJump, type ClockReport } from "./playback-clock.svelte";

vi.mock("svelte/motion", () => ({ prefersReducedMotion: { current: false } }));

let now = 0;

beforeEach(() => {
  now = 0;
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const report = (overrides: Partial<ClockReport> = {}): ClockReport => ({
  itemId: 1,
  positionMs: 10_000,
  durationMs: 60_000,
  playing: true,
  seekCount: 0,
  ...overrides,
});

describe("PlaybackClock.estimate", () => {
  it("advances from the last report while playing", () => {
    const clock = new PlaybackClock();
    clock.accept(report());
    now = 400;
    expect(clock.estimate()).toBe(10_400);
  });

  it("freezes while paused and clamps to the track", () => {
    const clock = new PlaybackClock();
    clock.accept(report({ playing: false }));
    now = 5_000;
    expect(clock.estimate()).toBe(10_000);

    clock.accept(report({ playing: true, positionMs: 59_000 }));
    now = 10_000;
    expect(clock.estimate()).toBe(60_000);
  });

  it("is zero before any report", () => {
    expect(new PlaybackClock().estimate()).toBe(0);
  });
});

describe("PlaybackClock jumps", () => {
  it("announces a seek only when the seek count grows", () => {
    const clock = new PlaybackClock();
    const jumps: ClockJump[] = [];
    clock.onJump((jump) => jumps.push(jump));

    clock.accept(report());
    clock.accept(report({ positionMs: 10_050 }));
    expect(jumps).toHaveLength(0);

    clock.accept(report({ positionMs: 30_000, seekCount: 1 }));
    expect(jumps).toEqual([{ kind: "seek", fromMs: 10_050, toMs: 30_000 }]);
  });

  it("announces a track change when the item changes", () => {
    const clock = new PlaybackClock();
    const jumps: ClockJump[] = [];
    clock.onJump((jump) => jumps.push(jump));

    clock.accept(report());
    clock.accept(report({ itemId: 2, positionMs: 0 }));
    expect(jumps.map((jump) => jump.kind)).toEqual(["track"]);
  });
});

describe("PlaybackClock.onBoundary", () => {
  it("wakes at once and again at the next boundary while playing", () => {
    const clock = new PlaybackClock();
    const woken: number[] = [];
    clock.onBoundary(
      (positionMs) => (positionMs < 12_000 ? 12_000 : null),
      (positionMs) => woken.push(positionMs),
    );
    clock.accept(report());
    // Once at registration (nothing loaded) and once for the report.
    expect(woken).toEqual([0, 10_000]);

    now = 2_000;
    vi.advanceTimersByTime(2_000);
    expect(woken.at(-1)).toBe(12_000);
  });

  it("is not armed while paused", () => {
    const clock = new PlaybackClock();
    const woken: number[] = [];
    clock.onBoundary(
      () => 12_000,
      (positionMs) => woken.push(positionMs),
    );
    clock.accept(report({ playing: false }));
    vi.advanceTimersByTime(5_000);
    expect(woken).toEqual([0, 10_000]);
  });
});
