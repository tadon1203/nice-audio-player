import { motionFor } from "$lib/ui/motion/svelte-motion";
import { tweenNumber, type NumberTween } from "$lib/ui/motion/tween-number";
import {
  estimateClock,
  initialClockState,
  reduceClock,
  type ClockJump,
  type ClockReport,
  type ClockState,
} from "./playback-clock-model";

type ClockEnvironment = {
  now: () => number;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
};

const browserEnvironment: ClockEnvironment = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};

/** A number that tells subscribers when it changes, without any framework. */
export type ClockPosition = {
  get: () => number;
  subscribe: (listener: (ms: number) => void) => () => void;
};

/**
 * The one clock for the playback position. Everything that draws time smoothly (the progress
 * fill and ring, lyric lines, the Light) subscribes to `position`, which one animation frame loop
 * advances; nothing re-renders with it. The loop runs only while someone has `retain`ed the clock
 * and the track is playing. Jumps are announced from facts the backend reported (see
 * `reduceClock`), once, to everyone.
 *
 * The clock knows nothing about stores or components: whoever mirrors playback state feeds it
 * with `accept(report)` whenever a snapshot is accepted.
 */
export function createPlaybackClock(environment: ClockEnvironment = browserEnvironment) {
  let current = 0;
  const positionListeners = new Set<(ms: number) => void>();
  const setPosition = (ms: number) => {
    current = ms;
    positionListeners.forEach((listener) => listener(ms));
  };
  /** The position as drawn: eased across a seek, exact otherwise. */
  const position: ClockPosition = {
    get: () => current,
    subscribe: (listener) => {
      positionListeners.add(listener);
      return () => void positionListeners.delete(listener);
    },
  };

  let state: ClockState = initialClockState;
  let retained = 0;
  let frame = 0;
  let glide: NumberTween | null = null;
  let holds = 0;
  const jumpListeners = new Set<(jump: ClockJump) => void>();
  const reportListeners = new Set<() => void>();

  const stopFrames = () => {
    environment.cancelFrame(frame);
    frame = 0;
  };
  const step = () => {
    frame = 0;
    if (holds === 0) setPosition(estimateClock(state, environment.now()));
    schedule();
  };
  function schedule() {
    if (frame !== 0 || retained === 0 || glide !== null) return;
    if (state.report?.playing === true) frame = environment.requestFrame(step);
  }

  const settle = () => {
    stopFrames();
    if (glide === null && holds === 0) setPosition(estimateClock(state, environment.now()));
    schedule();
  };

  const onJump = (jump: ClockJump) => {
    glide?.stop();
    glide = null;
    if (jump.kind === "seek" && retained > 0) {
      // Ease across a seek: the fill glides to the new place instead of snapping.
      stopFrames();
      const controls = tweenNumber(current, jump.toMs, {
        ...motionFor("move"),
        onUpdate: setPosition,
      });
      glide = controls;
      void controls.finished.then(() => {
        if (glide !== controls) return;
        glide = null;
        // Playback carried on under the glide: pick the clock up where it is now.
        settle();
      });
    }
    jumpListeners.forEach((listener) => listener(jump));
  };

  return {
    position,
    /** Feeds the clock what the latest playback snapshot or position event says about time. */
    accept: (report: ClockReport | null) => {
      const result = reduceClock(state, report, environment.now());
      state = result.state;
      if (result.jump !== null) onJump(result.jump);
      if (glide === null) settle();
      reportListeners.forEach((listener) => listener());
    },
    /** Where playback is now, exactly (not eased): for logic, not for drawing. */
    estimate: () => estimateClock(state, environment.now()),
    playing: () => state.report?.playing === true,
    /**
     * Draws `ms` until the returned function is called, whatever the reports say: a seek has
     * been asked for but not yet reported, and the bar must not fall back to the old position
     * (or glide from it) meanwhile.
     */
    hold: (ms: number) => {
      holds += 1;
      glide?.stop();
      glide = null;
      setPosition(ms);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds -= 1;
        settle();
      };
    },
    /** Keeps the frame loop running until the returned function is called. */
    retain: () => {
      retained += 1;
      if (retained === 1) settle();
      return () => {
        retained = Math.max(0, retained - 1);
        if (retained === 0) stopFrames();
      };
    },
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

/**
 * Follows the clock's position for as long as the returned function is not called: calls
 * `listener` with the current position, keeps the frame loop running, and calls it again on every
 * change. The one way to read time for drawing; return it from an effect or an attachment.
 */
export function watchClock(
  clock: Pick<PlaybackClock, "position" | "retain">,
  listener: (positionMs: number) => void,
): () => void {
  listener(clock.position.get());
  const release = clock.retain();
  const unsubscribe = clock.position.subscribe(listener);
  return () => {
    unsubscribe();
    release();
  };
}
