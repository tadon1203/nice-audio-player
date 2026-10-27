import type { Attachment } from "svelte/attachments";
import { prefersReducedMotion } from "svelte/motion";
import type { CurrentPlayback, QueueItemId } from "#lib/native/bindings";

/** What the Player state says about time: everything the clock needs, and nothing else. */
export type ClockReport = Pick<CurrentPlayback, "positionMs" | "durationMs" | "seekCount"> & {
  itemId: QueueItemId;
  playing: boolean;
};

/**
 * The position moved on purpose. `kind` is a fact the backend reported (a seek completed, the
 * track changed), never a guess from how far the numbers moved.
 */
export interface ClockJump {
  kind: "seek" | "track";
  fromMs: number;
  toMs: number;
}

type TimerHandle = ReturnType<typeof setTimeout>;

/** One keyframe of a driven animation, at a position in the track. Transform and opacity only. */
export interface DriveKeyframe {
  atMs: number;
  transform?: string;
  opacity?: number;
}

/** A seek eases the driven animations to the new place over this long. */
export const GLIDE_MS = 300;
/** A report moves a running animation only when it is further off than this. */
const RESYNC_DRIFT_MS = 20;

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

interface Driven {
  node: HTMLElement;
  keyframes: readonly DriveKeyframe[];
  animation: Animation | null;
  /** False for an element that eases itself: holds and glides pass it by. */
  follows: boolean;
}
interface Boundary {
  nextBoundaryMs: (positionMs: number) => number | null;
  listener: (positionMs: number) => void;
  timer: TimerHandle | null;
}

/**
 * The one clock for the playback position. Nothing reads it frame by frame: a consumer either
 * `drive`s an element with keyframes over the track, which the compositor advances, or asks to be
 * woken at a boundary with `onBoundary`. Jumps are announced from facts the backend reported, once,
 * to everyone.
 *
 * The clock knows nothing about stores or components: the Player feeds it with `accept(report)`
 * whenever a Player state is accepted.
 */
export class PlaybackClock {
  #report: ClockReport | null = null;
  #anchor = { positionMs: 0, atMs: 0 };
  readonly #driven = new Set<Driven>();
  readonly #boundaries = new Set<Boundary>();
  readonly #jumpListeners = new Set<(jump: ClockJump) => void>();
  #holds = 0;
  #heldMs = 0;
  #glide: { frame: number } | null = null;

  /** Feeds the clock the latest Player state or position event. */
  public accept(report: ClockReport | null): void {
    const now = performance.now();
    const before = this.#report;
    const jump = this.#jumpOf(before, report, now);
    const sameTrack =
      before !== null &&
      report !== null &&
      before.itemId === report.itemId &&
      before.durationMs === report.durationMs;
    this.#report = report;
    this.#anchor = { positionMs: report?.positionMs ?? 0, atMs: now };

    for (const entry of this.#driven) {
      if (!sameTrack && entry.animation) this.#stop(entry);
      if (entry.animation === null) this.#start(entry);
    }
    if (jump !== null) this.#onJump(jump);
    for (const entry of this.#driven) this.#resync(entry, false);
    this.#boundaries.forEach((boundary) => this.#arm(boundary));
  }

  /** Where playback is now, exactly: for logic, not for drawing. */
  public estimate(): number {
    return this.#estimateAt(performance.now());
  }

  public playing(): boolean {
    return this.#report?.playing === true;
  }

  /**
   * Draws `ms` until the returned function is called, whatever the reports say: a seek has been asked
   * for but not yet reported, and the bar must not fall back to the old position (or glide from it)
   * meanwhile. Calling it again before releasing the first moves the hold.
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
   * An attachment that runs one animation on its element across the whole track: `keyframes` are in
   * track ms, and the compositor advances them. Nothing runs while the duration is unknown. With
   * `follows: false` the element stays on the live position through holds and seeks, for one that
   * eases between its own values (the Artwork glow).
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
   * Calls `listener` with the position now, after every report and jump, and while playing at each
   * boundary `nextBoundaryMs` names (a position, or null for none). The clock owns the timer: it is
   * re-armed on a report or jump and absent while paused.
   */
  public onBoundary(
    nextBoundaryMs: (positionMs: number) => number | null,
    listener: (positionMs: number) => void,
  ): () => void {
    const boundary: Boundary = { nextBoundaryMs, listener, timer: null };
    this.#boundaries.add(boundary);
    this.#arm(boundary);
    return () => {
      if (boundary.timer !== null) clearTimeout(boundary.timer);
      this.#boundaries.delete(boundary);
    };
  }

  public onJump(listener: (jump: ClockJump) => void): () => void {
    this.#jumpListeners.add(listener);
    return () => void this.#jumpListeners.delete(listener);
  }

  /** The position at `nowMs`, from the last report. Frozen while paused, clamped to the track. */
  #estimateAt(nowMs: number): number {
    if (this.#report === null) return 0;
    const elapsed = this.#report.playing ? Math.max(0, nowMs - this.#anchor.atMs) : 0;
    const estimate = this.#anchor.positionMs + elapsed;
    const total = this.#report.durationMs;
    return total === null ? estimate : Math.min(total, estimate);
  }

  /**
   * A jump is announced only for a change of track or of `seekCount`: a report that arrives late, or
   * disagrees with the estimate, is just a correction, so a slow IPC round trip can never look like a
   * seek.
   */
  #jumpOf(
    previous: ClockReport | null,
    report: ClockReport | null,
    nowMs: number,
  ): ClockJump | null {
    if (previous === null || report === null) return null;
    const kind =
      report.itemId !== previous.itemId
        ? "track"
        : report.seekCount !== previous.seekCount
          ? "seek"
          : null;
    if (kind === null) return null;
    return { kind, fromMs: this.#estimateAt(nowMs), toMs: report.positionMs };
  }

  /** Puts one animation where the clock is, unless a hold or a glide is moving it. */
  #resync({ animation, follows }: Driven, force: boolean): void {
    if (animation === null || (follows && (this.#holds > 0 || this.#glide !== null))) return;
    const at = this.estimate();
    if (this.playing()) {
      const current = animation.currentTime === null ? Number.NaN : Number(animation.currentTime);
      if (force || Math.abs(current - at) > RESYNC_DRIFT_MS) {
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
    const animation = entry.node.animate(keyframes, {
      duration: total,
      easing: "linear",
      fill: "both",
    });
    animation.pause();
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
    if (boundary.timer !== null) clearTimeout(boundary.timer);
    boundary.timer = null;
    const at = this.estimate();
    boundary.listener(at);
    if (!this.playing()) return;
    const next = boundary.nextBoundaryMs(at);
    const total = this.#durationMs();
    if (next === null || (total !== null && next > total)) return;
    boundary.timer = setTimeout(
      () => {
        boundary.timer = null;
        this.#arm(boundary);
      },
      Math.max(0, next - at),
    );
  }

  #stopGlide(): void {
    if (this.#glide === null) return;
    cancelAnimationFrame(this.#glide.frame);
    this.#glide = null;
  }

  /** Eases every driven animation from `fromMs` to the live position, then lets them run. */
  #startGlide(fromMs: number): void {
    this.#stopGlide();
    for (const { animation, follows } of this.#driven) if (follows) animation?.pause();
    const begun = performance.now();
    const current = { frame: 0 };
    this.#glide = current;
    const step = (): void => {
      if (this.#glide !== current) return;
      const t = Math.min(1, (performance.now() - begun) / GLIDE_MS);
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
      current.frame = requestAnimationFrame(step);
    };
    current.frame = requestAnimationFrame(step);
  }

  #onJump(jump: ClockJump): void {
    this.#stopGlide();
    const gliding = [...this.#driven].some((entry) => entry.follows);
    if (jump.kind === "seek" && this.#holds === 0 && gliding && !prefersReducedMotion.current) {
      this.#startGlide(jump.fromMs);
    }
    this.#jumpListeners.forEach((listener) => listener(jump));
  }

  #durationMs(): number | null {
    return this.#report?.durationMs ?? null;
  }
}
