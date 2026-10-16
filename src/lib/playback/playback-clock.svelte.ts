import type { Attachment } from "svelte/attachments";
import { prefersReducedMotion } from "svelte/motion";
import { ClockState, type ClockJump, type ClockReport } from "./clock-state";

/** The part of a Web Animation the clock uses; tests supply their own. */
export type ClockAnimation = {
  currentTime: number | null;
  play: () => void;
  pause: () => void;
  cancel: () => void;
};

type TimerHandle = ReturnType<typeof setTimeout>;

/** What the clock reads from its surroundings. The browser supplies it unless a test overrides it. */
export type ClockEnvironment = {
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
  /** False for an element that eases itself: holds and glides pass it by. */
  follows: boolean;
};
type Boundary = {
  nextBoundaryMs: (positionMs: number) => number | null;
  listener: (positionMs: number) => void;
  timer: TimerHandle | null;
};

/**
 * The one clock for the playback position (ADR 0004). Nothing reads it frame by frame: a consumer
 * either `drive`s an element with keyframes over the track, which the compositor advances, or
 * asks to be woken at a boundary with `onBoundary`. Jumps are announced from facts the backend
 * reported (see `ClockState.reduce`), once, to everyone.
 *
 * The clock knows nothing about stores or components: whoever mirrors playback state feeds it
 * with `accept(report)` whenever a snapshot is accepted.
 */
export class PlaybackClock {
  readonly #environment: ClockEnvironment;
  #state = ClockState.initial;
  readonly #driven = new Set<Driven>();
  readonly #boundaries = new Set<Boundary>();
  readonly #jumpListeners = new Set<(jump: ClockJump) => void>();
  #holds = 0;
  #heldMs = 0;
  #glide: { frame: number } | null = null;

  public constructor(environment: Partial<ClockEnvironment> = {}) {
    this.#environment = { ...browserEnvironment, ...environment };
  }

  /** Feeds the clock what the latest playback snapshot or position event says about time. */
  public accept(report: ClockReport | null): void {
    const before = this.#state.report;
    const result = this.#state.reduce(report, this.#environment.now());
    this.#state = result.state;
    const sameTrack =
      before !== null &&
      report !== null &&
      before.itemId === report.itemId &&
      before.durationMs === report.durationMs;
    for (const entry of this.#driven) {
      if (!sameTrack && entry.animation) this.#stop(entry);
      if (entry.animation === null) this.#start(entry);
    }
    if (result.jump !== null) this.#onJump(result.jump);
    for (const entry of this.#driven) this.#resync(entry, false);
    this.#boundaries.forEach((boundary) => this.#arm(boundary));
  }

  /** Where playback is now, exactly: for logic, not for drawing. */
  public estimate(): number {
    return this.#state.estimate(this.#environment.now());
  }

  public playing(): boolean {
    return this.#state.report?.playing === true;
  }

  /**
   * Draws `ms` until the returned function is called, whatever the reports say: a seek has
   * been asked for but not yet reported, and the bar must not fall back to the old position
   * (or glide from it) meanwhile. Calling it again before releasing the first moves the hold.
   */
  public hold(ms: number): () => void {
    this.#holds += 1;
    this.#heldMs = ms;
    this.#stopGlide();
    for (const { animation, follows } of this.#driven) {
      if (!animation || !follows) continue;
      animation.pause();
      animation.currentTime = ms;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#holds -= 1;
      if (this.#holds > 0) return;
      for (const entry of this.#driven) this.#resync(entry, false);
    };
  }

  /**
   * An attachment that runs one animation on its element across the whole track: `keyframes`
   * are in track ms, and the compositor advances them. Nothing runs while the duration is
   * unknown. With `follows: false` the element stays on the live position through holds and
   * seeks, for one that eases between its own values (the Artwork glow).
   */
  public readonly drive = (
    keyframes: readonly DriveKeyframe[],
    { follows = true }: { follows?: boolean } = {},
  ): Attachment<HTMLElement> => {
    return (node) => {
      const entry: Driven = { node, keyframes, animation: null, follows };
      this.#driven.add(entry);
      this.#start(entry);
      return () => {
        this.#stop(entry);
        this.#driven.delete(entry);
      };
    };
  };

  /**
   * Calls `listener` with the position now, after every report and jump, and while playing at
   * each boundary `nextBoundaryMs` names (a position, or null for none). The clock owns the
   * timer: it is re-armed on a report or jump and absent while paused.
   */
  public onBoundary(
    nextBoundaryMs: (positionMs: number) => number | null,
    listener: (positionMs: number) => void,
  ): () => void {
    const boundary: Boundary = { nextBoundaryMs, listener, timer: null };
    this.#boundaries.add(boundary);
    this.#arm(boundary);
    return () => {
      if (boundary.timer !== null) this.#environment.clearTimer(boundary.timer);
      this.#boundaries.delete(boundary);
    };
  }

  public onJump(listener: (jump: ClockJump) => void): () => void {
    this.#jumpListeners.add(listener);
    return () => void this.#jumpListeners.delete(listener);
  }

  /** Puts one animation where the clock is, unless a hold or a glide is moving it. */
  #resync({ animation, follows }: Driven, force: boolean): void {
    if (animation === null || (follows && (this.#holds > 0 || this.#glide !== null))) return;
    const at = this.estimate();
    if (this.playing()) {
      if (force || Math.abs((animation.currentTime ?? Number.NaN) - at) > RESYNC_DRIFT_MS) {
        animation.currentTime = at;
      }
      animation.play();
    } else {
      animation.pause();
      animation.currentTime = at;
    }
  }

  #start(entry: Driven): void {
    const total = this.#durationMs();
    if (total === null || total <= 0) return;
    const keyframes = entry.keyframes.map(({ atMs, ...style }) => ({
      ...style,
      offset: Math.min(1, Math.max(0, atMs / total)),
    }));
    const animation = this.#environment.animate(entry.node, keyframes, { duration: total });
    entry.animation = animation;
    if (entry.follows && this.#holds > 0) {
      animation.pause();
      animation.currentTime = this.#heldMs;
    } else if (entry.follows && this.#glide !== null) {
      animation.pause();
    } else {
      this.#resync(entry, true);
    }
  }

  #stop(entry: Driven): void {
    entry.animation?.cancel();
    entry.animation = null;
  }

  /** Wakes each boundary consumer now and arms its timer for the next boundary. */
  #arm(boundary: Boundary): void {
    if (boundary.timer !== null) this.#environment.clearTimer(boundary.timer);
    boundary.timer = null;
    const at = this.estimate();
    boundary.listener(at);
    if (!this.playing()) return;
    const next = boundary.nextBoundaryMs(at);
    const total = this.#durationMs();
    if (next === null || (total !== null && next > total)) return;
    boundary.timer = this.#environment.setTimer(
      () => {
        boundary.timer = null;
        this.#arm(boundary);
      },
      Math.max(0, next - at),
    );
  }

  #stopGlide(): void {
    if (this.#glide === null) return;
    this.#environment.cancelFrame(this.#glide.frame);
    this.#glide = null;
  }

  /** Eases every driven animation from `fromMs` to the live position, then lets them run. */
  #startGlide(fromMs: number): void {
    this.#stopGlide();
    for (const { animation, follows } of this.#driven) if (follows) animation?.pause();
    const begun = this.#environment.now();
    const current = { frame: 0 };
    this.#glide = current;
    const step = () => {
      if (this.#glide !== current) return;
      const t = Math.min(1, (this.#environment.now() - begun) / GLIDE_MS);
      const target = this.estimate();
      if (t >= 1) {
        this.#glide = null;
        for (const entry of this.#driven) this.#resync(entry, true);
        return;
      }
      for (const { animation, follows } of this.#driven) {
        if (follows && animation)
          animation.currentTime = fromMs + (target - fromMs) * easeOutCubic(t);
      }
      current.frame = this.#environment.requestFrame(step);
    };
    current.frame = this.#environment.requestFrame(step);
  }

  #onJump(jump: ClockJump): void {
    this.#stopGlide();
    const gliding = [...this.#driven].some((entry) => entry.follows);
    if (
      jump.kind === "seek" &&
      this.#holds === 0 &&
      gliding &&
      !this.#environment.reducedMotion()
    ) {
      this.#startGlide(jump.fromMs);
    }
    this.#jumpListeners.forEach((listener) => listener(jump));
  }

  #durationMs(): number | null {
    return this.#state.report?.durationMs ?? null;
  }
}
