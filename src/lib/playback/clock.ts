import type { Attachment } from "svelte/attachments";
import { prefersReducedMotion } from "svelte/motion";
import {
  estimateClock,
  initialClockState,
  reduceClock,
  type ClockJump,
  type ClockReport,
  type ClockState,
} from "./playback-clock-model";

/** The part of a Web Animation the clock uses; tests supply their own. */
export type ClockAnimation = {
  currentTime: number | null;
  play: () => void;
  pause: () => void;
  cancel: () => void;
};

type TimerHandle = ReturnType<typeof setTimeout>;

type ClockEnvironment = {
  now: () => number;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  animate: (
    node: HTMLElement,
    keyframes: Keyframe[],
    options: { duration: number },
  ) => ClockAnimation;
  setTimer: (callback: () => void, ms: number) => TimerHandle;
  clearTimer: (handle: TimerHandle) => void;
  reducedMotion: () => boolean;
};

const browserEnvironment: ClockEnvironment = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  animate: (node, keyframes, { duration }) => {
    const animation = node.animate(keyframes, { duration, easing: "linear", fill: "both" });
    animation.pause();
    return {
      get currentTime() {
        return animation.currentTime === null ? null : Number(animation.currentTime);
      },
      set currentTime(ms) {
        animation.currentTime = ms;
      },
      play: () => animation.play(),
      pause: () => animation.pause(),
      cancel: () => animation.cancel(),
    };
  },
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle),
  reducedMotion: () => prefersReducedMotion.current,
};

/** A number that tells subscribers when it changes, without any framework. */
export type ClockPosition = {
  get: () => number;
  subscribe: (listener: (ms: number) => void) => () => void;
};

/** One keyframe of a driven animation, at a position in the track. Transform and opacity only. */
export type DriveKeyframe = { atMs: number; transform?: string; opacity?: number };

/** A seek eases the driven animations to the new place over this long. */
export const GLIDE_MS = 300;
/** A report moves a running animation only when it is further off than this. */
const RESYNC_DRIFT_MS = 20;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

type Driven = {
  node: HTMLElement;
  keyframes: readonly DriveKeyframe[];
  animation: ClockAnimation | null;
};
type Boundary = {
  nextBoundaryMs: (positionMs: number) => number | null;
  listener: (positionMs: number) => void;
  timer: TimerHandle | null;
};

/**
 * The one clock for the playback position (ADR 0014). Nothing reads it frame by frame: a consumer
 * either `drive`s an element with keyframes over the track, which the compositor advances, or
 * asks to be woken at a boundary with `onBoundary`. Jumps are announced from facts the backend
 * reported (see `reduceClock`), once, to everyone.
 *
 * The clock knows nothing about stores or components: whoever mirrors playback state feeds it
 * with `accept(report)` whenever a snapshot is accepted.
 */
export function createPlaybackClock(overrides: Partial<ClockEnvironment> = {}) {
  const environment: ClockEnvironment = { ...browserEnvironment, ...overrides };
  let state: ClockState = initialClockState;
  const driven = new Set<Driven>();
  const boundaries = new Set<Boundary>();
  const jumpListeners = new Set<(jump: ClockJump) => void>();
  let holds = 0;
  let heldMs = 0;
  let glide: { frame: number } | null = null;

  const estimate = () => estimateClock(state, environment.now());
  const playing = () => state.report?.playing === true;
  const durationMs = () => state.report?.durationMs ?? null;

  const setAll = (ms: number) => {
    for (const { animation } of driven) if (animation) animation.currentTime = ms;
  };

  /** Puts one animation where the clock is, unless a hold or a glide is moving it. */
  const resync = (animation: ClockAnimation, force: boolean) => {
    if (holds > 0 || glide !== null) return;
    const at = estimate();
    if (playing()) {
      if (force || Math.abs((animation.currentTime ?? Number.NaN) - at) > RESYNC_DRIFT_MS) {
        animation.currentTime = at;
      }
      animation.play();
    } else {
      animation.pause();
      animation.currentTime = at;
    }
  };

  const start = (entry: Driven) => {
    const total = durationMs();
    if (total === null || total <= 0) return;
    const keyframes = entry.keyframes.map(({ atMs, ...style }) => ({
      ...style,
      offset: Math.min(1, Math.max(0, atMs / total)),
    }));
    const animation = environment.animate(entry.node, keyframes, { duration: total });
    entry.animation = animation;
    if (holds > 0) {
      animation.pause();
      animation.currentTime = heldMs;
    } else if (glide !== null) {
      animation.pause();
    } else {
      resync(animation, true);
    }
  };
  const stop = (entry: Driven) => {
    entry.animation?.cancel();
    entry.animation = null;
  };

  /** Wakes each boundary consumer now and arms its timer for the next boundary. */
  const arm = (boundary: Boundary) => {
    if (boundary.timer !== null) environment.clearTimer(boundary.timer);
    boundary.timer = null;
    const at = estimate();
    boundary.listener(at);
    if (!playing()) return;
    const next = boundary.nextBoundaryMs(at);
    const total = durationMs();
    if (next === null || (total !== null && next > total)) return;
    boundary.timer = environment.setTimer(
      () => {
        boundary.timer = null;
        arm(boundary);
      },
      Math.max(0, next - at),
    );
  };

  const stopGlide = () => {
    if (glide === null) return;
    environment.cancelFrame(glide.frame);
    glide = null;
  };

  /** Eases every driven animation from `fromMs` to the live position, then lets them run. */
  const startGlide = (fromMs: number) => {
    stopGlide();
    for (const { animation } of driven) animation?.pause();
    const begun = environment.now();
    const current = { frame: 0 };
    glide = current;
    const step = () => {
      if (glide !== current) return;
      const t = Math.min(1, (environment.now() - begun) / GLIDE_MS);
      const target = estimate();
      if (t >= 1) {
        glide = null;
        for (const { animation } of driven) if (animation) resync(animation, true);
        return;
      }
      setAll(fromMs + (target - fromMs) * easeOutCubic(t));
      current.frame = environment.requestFrame(step);
    };
    current.frame = environment.requestFrame(step);
  };

  const onJump = (jump: ClockJump) => {
    stopGlide();
    if (jump.kind === "seek" && holds === 0 && driven.size > 0 && !environment.reducedMotion()) {
      startGlide(jump.fromMs);
    }
    jumpListeners.forEach((listener) => listener(jump));
  };

  return {
    /** Feeds the clock what the latest playback snapshot or position event says about time. */
    accept: (report: ClockReport | null) => {
      const before = state.report;
      const result = reduceClock(state, report, environment.now());
      state = result.state;
      const sameTrack =
        before !== null &&
        report !== null &&
        before.itemId === report.itemId &&
        before.durationMs === report.durationMs;
      for (const entry of driven) {
        if (!sameTrack && entry.animation) stop(entry);
        if (entry.animation === null) start(entry);
      }
      if (result.jump !== null) onJump(result.jump);
      for (const entry of driven) if (entry.animation) resync(entry.animation, false);
      boundaries.forEach(arm);
    },
    /** Where playback is now, exactly: for logic, not for drawing. */
    estimate,
    playing,
    /**
     * Draws `ms` until the returned function is called, whatever the reports say: a seek has
     * been asked for but not yet reported, and the bar must not fall back to the old position
     * (or glide from it) meanwhile. Calling it again before releasing the first moves the hold.
     */
    hold: (ms: number) => {
      holds += 1;
      heldMs = ms;
      stopGlide();
      for (const { animation } of driven) {
        animation?.pause();
        if (animation) animation.currentTime = ms;
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds -= 1;
        if (holds > 0) return;
        for (const { animation } of driven) if (animation) resync(animation, false);
      };
    },
    /**
     * An attachment that runs one animation on its element across the whole track: `keyframes`
     * are in track ms, and the compositor advances them. Nothing runs while the duration is
     * unknown.
     */
    drive:
      (keyframes: readonly DriveKeyframe[]): Attachment<HTMLElement> =>
      (node) => {
        const entry: Driven = { node, keyframes, animation: null };
        driven.add(entry);
        start(entry);
        return () => {
          stop(entry);
          driven.delete(entry);
        };
      },
    /**
     * Calls `listener` with the position now, after every report and jump, and while playing at
     * each boundary `nextBoundaryMs` names (a position, or null for none). The clock owns the
     * timer: it is re-armed on a report or jump and absent while paused.
     */
    onBoundary: (
      nextBoundaryMs: (positionMs: number) => number | null,
      listener: (positionMs: number) => void,
    ) => {
      const boundary: Boundary = { nextBoundaryMs, listener, timer: null };
      boundaries.add(boundary);
      arm(boundary);
      return () => {
        if (boundary.timer !== null) environment.clearTimer(boundary.timer);
        boundaries.delete(boundary);
      };
    },
    onJump: (listener: (jump: ClockJump) => void) => {
      jumpListeners.add(listener);
      return () => void jumpListeners.delete(listener);
    },
  };
}

export type PlaybackClock = ReturnType<typeof createPlaybackClock>;
