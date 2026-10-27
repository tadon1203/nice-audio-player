import type { Attachment } from "svelte/attachments";
import { SpringCurve } from "#lib/components/ui/motion/spring-curve";
import { levelToUnit } from "#lib/utils/level";
import type { DriveKeyframe, PlaybackClock } from "./playback-clock.svelte";

/** The smoothed loudness (0-1) at a position in the track. */
export interface LoudnessKeyframe {
  atMs: number;
  level: number;
}

export interface GlowBreathOptions {
  clock: Pick<PlaybackClock, "drive" | "estimate" | "playing" | "onJump" | "onBoundary">;
  /** Opacity keyframes over the track, in track ms (precomputed from the loudness). */
  keyframes: readonly (DriveKeyframe & { opacity: number })[];
  /** Where a paused Artwork glow rests. */
  restOpacity: number;
  /** Length of an ease between two values (a seek, a pause, a resume). */
  durationMs: number;
}

/** Slow on purpose: the Artwork glow follows the passage (a chorus brightening it), not each beat. */
const ATTACK_MS = 700;
const RELEASE_MS = 1_800;

/** One step of a one-pole low-pass: quick to rise (attack), slow to fall (release). */
export function smoothLoudness(current: number, target: number, dtMs: number): number {
  const tau = target > current ? ATTACK_MS : RELEASE_MS;
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dtMs) / tau));
}

/**
 * The loudness over the whole track, smoothed once, forward in time, at the waveform's own
 * resolution (one keyframe per bucket, each at the bucket's start). The RMS is read on the dB scale
 * of the waveform bars, since peaks sit near full scale and would not move. Empty without a
 * waveform or a duration. The compositor draws linear interpolation between keyframes.
 */
export function loudnessKeyframes(
  rms: readonly number[] | null,
  durationMs: number | null,
): LoudnessKeyframe[] {
  if (rms === null || rms.length === 0 || durationMs === null || durationMs <= 0) return [];
  const bucketMs = durationMs / rms.length;
  const keyframes: LoudnessKeyframe[] = [];
  let level = 0;
  rms.forEach((value, index) => {
    level = smoothLoudness(level, levelToUnit(value), index === 0 ? 0 : bucketMs);
    keyframes.push({ atMs: index * bucketMs, level });
  });
  return keyframes;
}

/** The curve's opacity at `positionMs`, linear between keyframes like the compositor draws it. */
export function glowOpacityAt(
  keyframes: readonly { atMs: number; opacity: number }[],
  positionMs: number,
): number {
  const first = keyframes[0];
  if (first === undefined || positionMs <= first.atMs) return first?.opacity ?? 1;
  for (let i = 1; i < keyframes.length; i += 1) {
    const next = keyframes[i]!;
    if (positionMs > next.atMs) continue;
    const previous = keyframes[i - 1]!;
    const share = (positionMs - previous.atMs) / (next.atMs - previous.atMs);
    return previous.opacity + (next.opacity - previous.opacity) * share;
  }
  return keyframes[keyframes.length - 1]!.opacity;
}

/**
 * Breathes an element's opacity along `keyframes`, which the clock's compositor animation advances,
 * so nothing runs per frame. The Artwork glow is not part of the seek glide: on a seek it eases from
 * where it is to the curve's new value, on pause it eases to `restOpacity`, and on resume back to
 * the curve, each over `durationMs`, and only then does the clock drive it again.
 */
export function attachGlowBreath({
  clock,
  keyframes,
  restOpacity,
  durationMs,
}: GlowBreathOptions): Attachment<HTMLElement> {
  return (node) => {
    let stopDrive: (() => void) | null = null;
    let ease: Animation | null = null;
    let playing = clock.playing();

    const attach = (): void => {
      const cleanup = clock.drive(keyframes, { follows: false })(node);
      stopDrive = typeof cleanup === "function" ? cleanup : null;
    };
    const detach = (): void => {
      stopDrive?.();
      stopDrive = null;
    };

    /** Leaves the curve, eases to `to`, then hands the element back to the clock if asked. */
    const easeTo = (to: number, thenDrive: boolean): void => {
      const from = Number(getComputedStyle(node).opacity);
      ease?.cancel();
      detach();
      node.style.opacity = String(from);
      const animation = node.animate([{ opacity: from }, { opacity: to }], {
        duration: durationMs,
        easing: SpringCurve.linear,
        fill: "forwards",
      });
      ease = animation;
      animation.onfinish = (): void => {
        if (ease !== animation) return;
        ease = null;
        node.style.opacity = String(to);
        animation.cancel();
        if (thenDrive) {
          node.style.opacity = "";
          attach();
        }
      };
    };

    if (playing) {
      attach();
    } else {
      node.style.opacity = String(restOpacity);
    }

    const stopJumps = clock.onJump((jump): void => {
      if (jump.kind !== "seek" || !playing) return;
      easeTo(glowOpacityAt(keyframes, jump.toMs), true);
    });
    const stopBoundary = clock.onBoundary(
      () => null,
      (positionMs) => {
        const nowPlaying = clock.playing();
        if (nowPlaying === playing) return;
        playing = nowPlaying;
        easeTo(playing ? glowOpacityAt(keyframes, positionMs) : restOpacity, playing);
      },
    );

    return () => {
      stopJumps();
      stopBoundary();
      ease?.cancel();
      ease = null;
      detach();
      node.style.opacity = "";
    };
  };
}
