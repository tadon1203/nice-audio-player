import { animate, motionValue, type AnimationPlaybackControls } from "motion/react";
import type { StoreApi, UseBoundStore } from "zustand";
import { resolveTransition } from "@/shared/ui/motion";
import {
  estimateClock,
  initialClockState,
  reduceClock,
  type ClockJump,
  type ClockReport,
  type ClockState,
} from "../lib/playback-clock-model";
import { snapshotSession, usePlaybackStore, type PlaybackStoreState } from "./playback-session";

/** Reads what the clock needs from the mirrored playback state. */
export function clockReportOf(state: PlaybackStoreState): ClockReport | null {
  const session = snapshotSession(state.snapshot);
  if (session === null) return null;
  return {
    itemId: session.item.queueItemId,
    positionMs: session.positionMs,
    durationMs: session.durationMs,
    playing: state.snapshot?.status === "playing",
    seekRevision: session.seekRevision,
  };
}

type ClockEnvironment = {
  now: () => number;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
  reducedMotion: () => boolean;
};

const browserEnvironment: ClockEnvironment = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  reducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};

/**
 * The one clock for the playback position. Everything that draws time smoothly (the progress
 * fill and ring, lyric lines, the Light) reads `position`, a motion value that one animation
 * frame loop advances, and nothing re-renders with it. The loop runs only while someone has
 * `retain`ed the clock and the track is playing. Jumps are announced from facts the backend
 * reported (see `reduceClock`), once, to everyone.
 */
export function createPlaybackClock(
  store: UseBoundStore<StoreApi<PlaybackStoreState>>,
  environment: ClockEnvironment = browserEnvironment,
) {
  /** The position as drawn: eased across a seek, exact otherwise. */
  const position = motionValue(0);
  let state: ClockState = initialClockState;
  let retained = 0;
  let frame = 0;
  let spring: AnimationPlaybackControls | null = null;
  let lastJump: ClockJump | null = null;
  let lastSnapshot: PlaybackStoreState["snapshot"] = null;
  const jumpListeners = new Set<(jump: ClockJump) => void>();
  const reportListeners = new Set<() => void>();

  const stopFrames = () => {
    environment.cancelFrame(frame);
    frame = 0;
  };
  const step = () => {
    frame = 0;
    position.set(estimateClock(state, environment.now()));
    schedule();
  };
  function schedule() {
    if (frame !== 0 || retained === 0 || spring !== null) return;
    if (state.report?.playing === true) frame = environment.requestFrame(step);
  }

  const settle = () => {
    stopFrames();
    if (spring === null) position.set(estimateClock(state, environment.now()));
    schedule();
  };

  const onJump = (jump: ClockJump) => {
    lastJump = jump;
    spring?.stop();
    spring = null;
    if (jump.kind === "seek" && retained > 0) {
      // Ease across a seek: the fill glides to the new place instead of snapping.
      stopFrames();
      const controls = animate(
        position,
        jump.toMs,
        resolveTransition("smallMove", environment.reducedMotion()),
      );
      spring = controls;
      void controls.then(() => {
        if (spring !== controls) return;
        spring = null;
        // Playback carried on under the glide: pick the clock up where it is now.
        settle();
      });
    }
    jumpListeners.forEach((listener) => listener(jump));
  };

  const accept = (next: PlaybackStoreState) => {
    if (next.snapshot === lastSnapshot) return;
    lastSnapshot = next.snapshot;
    const result = reduceClock(state, clockReportOf(next), environment.now());
    state = result.state;
    if (result.jump !== null) onJump(result.jump);
    if (spring === null) settle();
    reportListeners.forEach((listener) => listener());
  };
  store.subscribe(accept);
  accept(store.getState());

  return {
    /** Milliseconds, advanced every frame while retained and playing. */
    position,
    /** Where playback is now, exactly (not eased): for logic, not for drawing. */
    estimate: () => estimateClock(state, environment.now()),
    playing: () => state.report?.playing === true,
    durationMs: () => state.report?.durationMs ?? null,
    /** Keeps the frame loop running until the returned function is called. */
    retain: () => {
      retained += 1;
      if (retained === 1) settle();
      return () => {
        retained = Math.max(0, retained - 1);
        if (retained === 0) stopFrames();
      };
    },
    /** The latest jump, or null before any. */
    lastJump: () => lastJump,
    onJump: (listener: (jump: ClockJump) => void) => {
      jumpListeners.add(listener);
      return () => void jumpListeners.delete(listener);
    },
    /** Every report that reached the clock: re-arm timers that were set from `estimate()`. */
    onReport: (listener: () => void) => {
      reportListeners.add(listener);
      return () => void reportListeners.delete(listener);
    },
  };
}

export type PlaybackClock = ReturnType<typeof createPlaybackClock>;

export const playbackClock = createPlaybackClock(usePlaybackStore);
