import { describe, expect, it, vi } from "vitest";
import type { ActiveSession, PlaybackItem, PlaybackSnapshot } from "$lib/native";
vi.mock("svelte/motion", () => ({ prefersReducedMotion: { current: false } }));

import { createPlaybackClock } from "./clock";
import { clockReportOf } from "./snapshot";

const item = (id: string): PlaybackItem => ({
  queueItemId: id,
  trackId: id,
  title: id,
  artist: null,
  album: null,
  albumArtist: null,
  artwork: null,
  durationMs: 60_000,
  trackNumber: null,
  discNumber: null,
  year: null,
  albumKey: null,
  albumTrackCount: null,
});

const session = (id: string, positionMs: number, seekRevision = 0): ActiveSession => ({
  item: item(id),
  playbackId: "1",
  positionMs,
  seekRevision,
  durationMs: 60_000,
  outputDevice: { id: "speakers", name: "Speakers" },
  channelConversion: "none",
  sourceFormat: "FLAC",
  sourceBitDepth: 24,
  sourceBitrateKbps: null,
  sourceSampleRate: 44_100,
  outputSampleRate: 44_100,
  resamplingActive: false,
});

let revision = 0;
const snapshot = (
  status: "playing" | "paused",
  id: string,
  positionMs: number,
  seekRevision = 0,
): PlaybackSnapshot => ({
  status,
  base: {
    revision: (revision += 1),
    volume: 1,
    muted: false,
    outputSelection: { kind: "systemDefault" },
    canGoPrevious: false,
    canGoNext: false,
  },
  session: session(id, positionMs, seekRevision),
});

class FakeAnimation {
  currentTime: number | null = null;
  running = false;
  cancelled = false;
  plays = 0;
  constructor(readonly keyframes: Keyframe[]) {}
  play() {
    this.running = true;
    this.plays += 1;
  }
  pause() {
    this.running = false;
  }
  cancel() {
    this.cancelled = true;
  }
}

/** A clock on hand-turned time, frames, timers and animations, so a test decides what passes. */
function setup() {
  let now = 0;
  let frame: (() => void) | null = null;
  let timers: { at: number; callback: () => void; id: number }[] = [];
  let nextId = 1;
  const animations: FakeAnimation[] = [];
  const clock = createPlaybackClock({
    now: () => now,
    requestFrame: (callback) => {
      frame = callback;
      return 1;
    },
    cancelFrame: () => {
      frame = null;
    },
    animate: (_node, keyframes) => {
      const animation = new FakeAnimation(keyframes);
      animations.push(animation);
      return animation;
    },
    setTimer: (callback, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, callback, id });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (handle) => {
      timers = timers.filter((timer) => timer.id !== (handle as unknown as number));
    },
    reducedMotion: () => false,
  });
  const report = (next: PlaybackSnapshot) => clock.accept(clockReportOf(next));
  /** Moves time forward, firing due timers in order. */
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at)[0];
      if (due === undefined) break;
      timers = timers.filter((timer) => timer !== due);
      now = Math.max(now, due.at);
      due.callback();
    }
    now = end;
  };
  const nextFrame = (ms: number) => {
    now += ms;
    const callback = frame;
    frame = null;
    callback?.();
  };
  const drive = (keyframes = [{ atMs: 0 }, { atMs: 60_000 }]) =>
    clock.drive(keyframes)({} as HTMLElement) as () => void;
  return { clock, report, advance, nextFrame, drive, animations, timers: () => timers.length };
}

const wholeSecond = (positionMs: number) => Math.floor(positionMs / 1000 + 1) * 1000;

describe("playback clock", () => {
  it("estimates the position from the last report, frozen while paused", () => {
    const { clock, report, advance } = setup();
    report(snapshot("playing", "a", 10_000));
    advance(500);
    expect(clock.estimate()).toBe(10_500);
    report(snapshot("paused", "a", 12_000));
    advance(500);
    expect(clock.estimate()).toBe(12_000);
    expect(clock.playing()).toBe(false);
  });

  it("announces a seek once, from the seek revision, and a new track", () => {
    const { clock, report, advance } = setup();
    const jumps: string[] = [];
    clock.onJump((jump) => jumps.push(`${jump.kind}:${jump.fromMs}->${jump.toMs}`));
    report(snapshot("playing", "a", 10_000));
    advance(500);
    report(snapshot("playing", "a", 40_000, 1));
    report(snapshot("playing", "a", 40_250, 1));
    report(snapshot("playing", "b", 0, 1));
    expect(jumps).toEqual(["seek:10500->40000", "track:40250->0"]);
  });

  it("does not announce a slow report as a seek", () => {
    const { clock, report, advance } = setup();
    const jumps: unknown[] = [];
    clock.onJump((jump) => jumps.push(jump));
    report(snapshot("playing", "a", 10_000));
    advance(3_000);
    report(snapshot("playing", "a", 10_200));
    expect(jumps).toEqual([]);
  });

  describe("onBoundary", () => {
    it("wakes at each boundary while playing, and stops while paused", () => {
      const { clock, report, advance, timers } = setup();
      const seen: number[] = [];
      report(snapshot("playing", "a", 10_400));
      clock.onBoundary(wholeSecond, (ms) => seen.push(ms));
      expect(seen).toEqual([10_400]);

      advance(600);
      expect(seen).toEqual([10_400, 11_000]);
      advance(1_000);
      expect(seen).toEqual([10_400, 11_000, 12_000]);

      report(snapshot("paused", "a", 12_300));
      expect(timers()).toBe(0);
      advance(5_000);
      expect(seen.at(-1)).toBe(12_300);
    });

    it("re-arms on a report and on a jump", () => {
      const { clock, report, advance } = setup();
      const seen: number[] = [];
      report(snapshot("playing", "a", 10_000));
      clock.onBoundary(wholeSecond, (ms) => seen.push(ms));

      advance(300);
      report(snapshot("playing", "a", 10_500));
      advance(499);
      expect(seen).toEqual([10_000, 10_500]);
      advance(1);
      expect(seen.at(-1)).toBe(11_000);

      report(snapshot("playing", "a", 40_200, 1));
      advance(800);
      expect(seen.at(-1)).toBe(41_000);
    });

    it("has no boundary past the end of the track, or after being removed", () => {
      const { clock, report, timers } = setup();
      report(snapshot("playing", "a", 59_500));
      const stop = clock.onBoundary(wholeSecond, () => {});
      expect(timers()).toBe(1);
      report(snapshot("playing", "a", 60_000));
      expect(timers()).toBe(0);
      report(snapshot("playing", "a", 1_000));
      expect(timers()).toBe(1);
      stop();
      expect(timers()).toBe(0);
    });
  });

  describe("drive", () => {
    it("runs nothing while the duration is unknown, then starts at the position", () => {
      const { drive, animations, report } = setup();
      drive();
      expect(animations).toHaveLength(0);
      report(snapshot("playing", "a", 10_000));
      expect(animations).toHaveLength(1);
      expect(animations[0]).toMatchObject({ currentTime: 10_000, running: true });
    });

    it("sets offsets from track time", () => {
      const { drive, animations, report } = setup();
      report(snapshot("playing", "a", 0));
      drive([{ atMs: 0 }, { atMs: 15_000 }, { atMs: 60_000 }]);
      expect(animations[0]?.keyframes.map((k) => k.offset)).toEqual([0, 0.25, 1]);
    });

    it("moves a running animation only when it has drifted more than 20 ms", () => {
      const { drive, animations, report, advance } = setup();
      report(snapshot("playing", "a", 10_000));
      drive();
      const animation = animations[0]!;
      advance(1_000);
      animation.currentTime = 11_000;
      report(snapshot("playing", "a", 11_015));
      expect(animation.currentTime).toBe(11_000);
      report(snapshot("playing", "a", 11_060));
      expect(animation.currentTime).toBe(11_060);
    });

    it("pauses at the reported position while paused", () => {
      const { drive, animations, report } = setup();
      report(snapshot("playing", "a", 10_000));
      drive();
      report(snapshot("paused", "a", 10_500));
      expect(animations[0]).toMatchObject({ currentTime: 10_500, running: false });
    });

    it("cancels on detach", () => {
      const { drive, animations, report } = setup();
      report(snapshot("playing", "a", 0));
      drive()();
      expect(animations[0]?.cancelled).toBe(true);
    });

    it("rebuilds for a new track and snaps to its position", () => {
      const { drive, animations, report } = setup();
      report(snapshot("playing", "a", 10_000));
      drive();
      report(snapshot("playing", "b", 5_000));
      expect(animations).toHaveLength(2);
      expect(animations[0]?.cancelled).toBe(true);
      expect(animations[1]).toMatchObject({ currentTime: 5_000, running: true });
    });
  });

  describe("glide", () => {
    it("eases currentTime to the new position over 300 ms, then plays", () => {
      const { drive, animations, report, nextFrame } = setup();
      report(snapshot("playing", "a", 10_000));
      drive();
      const animation = animations[0]!;
      const plays = animation.plays;

      report(snapshot("playing", "a", 40_000, 1));
      expect(animation.running).toBe(false);
      nextFrame(150);
      const middle = animation.currentTime!;
      expect(middle).toBeGreaterThan(10_000);
      expect(middle).toBeLessThan(40_150);
      nextFrame(100);
      expect(animation.currentTime!).toBeGreaterThan(middle);
      expect(animation.running).toBe(false);

      nextFrame(100);
      expect(animation.currentTime).toBe(40_350);
      expect(animation.running).toBe(true);
      expect(animation.plays).toBeGreaterThan(plays);
    });
  });

  describe("an element that does not follow", () => {
    it("jumps to the live position on a seek, through holds and glides", () => {
      const { clock, drive, animations, report, nextFrame } = setup();
      report(snapshot("playing", "a", 10_000));
      drive();
      clock.drive([{ atMs: 0 }, { atMs: 60_000 }], { follows: false })({} as HTMLElement);
      const [gliding, free] = animations as [FakeAnimation, FakeAnimation];

      const release = clock.hold(30_000);
      expect(gliding).toMatchObject({ currentTime: 30_000, running: false });
      expect(free.running).toBe(true);
      release();

      report(snapshot("playing", "a", 40_000, 1));
      expect(gliding.running).toBe(false);
      expect(free).toMatchObject({ currentTime: 40_000, running: true });
      nextFrame(300);
      expect(gliding.running).toBe(true);
    });
  });

  describe("hold", () => {
    it("pauses every driven animation at the held position, whatever the reports say", () => {
      const { clock, drive, animations, report } = setup();
      report(snapshot("playing", "a", 10_000));
      drive();
      drive();
      const release = clock.hold(40_000);
      expect(animations.map((a) => [a.currentTime, a.running])).toEqual([
        [40_000, false],
        [40_000, false],
      ]);

      report(snapshot("playing", "a", 10_100));
      report(snapshot("playing", "a", 40_000, 1));
      expect(animations.map((a) => a.running)).toEqual([false, false]);
      expect(animations[0]?.currentTime).toBe(40_000);

      release();
      expect(animations.map((a) => a.running)).toEqual([true, true]);
    });

    it("moves when held again before it is released, without running in between", () => {
      const { clock, drive, animations, report } = setup();
      report(snapshot("playing", "a", 10_000));
      drive();
      const first = clock.hold(20_000);
      const plays = animations[0]!.plays;
      const second = clock.hold(30_000);
      first();
      expect(animations[0]).toMatchObject({ currentTime: 30_000, running: false });
      expect(animations[0]?.plays).toBe(plays);
      second();
      expect(animations[0]?.running).toBe(true);
    });
  });
});
