import type { Attachment } from "svelte/attachments";
import { springLinear } from "$lib/ui/motion/spring-curve";
import type { DriveKeyframe, PlaybackClock } from "./clock";

export type GlowBreathOptions = {
  clock: Pick<PlaybackClock, "drive" | "estimate" | "playing" | "onJump" | "onBoundary">;
  /** Opacity keyframes over the track, in track ms (precomputed from the loudness). */
  keyframes: readonly (DriveKeyframe & { opacity: number })[];
  /** Where a paused Artwork glow rests. */
  restOpacity: number;
  /** Length of an ease between two values (a seek, a pause, a resume). */
  durationMs: number;
};

/** The curve's opacity at `positionMs`, linear between keyframes like the compositor draws it. */
export function opacityAt(
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
 * Breathes an element's opacity along `keyframes`, which the clock's compositor animation
 * advances, so nothing runs per frame. The Artwork glow is not part of the seek glide: on a seek it
 * eases from where it is to the curve's new value, on pause it eases to `restOpacity`, and on
 * resume back to the curve, each over `durationMs`, and only then does the clock drive it again.
 */
export function glowBreath({
  clock,
  keyframes,
  restOpacity,
  durationMs,
}: GlowBreathOptions): Attachment<HTMLElement> {
  return (node) => {
    let stopDrive: (() => void) | null = null;
    let ease: Animation | null = null;
    let playing = clock.playing();

    const attach = () => {
      const cleanup = clock.drive(keyframes, { follows: false })(node);
      stopDrive = typeof cleanup === "function" ? cleanup : null;
    };
    const detach = () => {
      stopDrive?.();
      stopDrive = null;
    };

    /** Leaves the curve, eases to `to`, then hands the element back to the clock if asked. */
    const easeTo = (to: number, thenDrive: boolean) => {
      const from = Number(getComputedStyle(node).opacity);
      ease?.cancel();
      detach();
      node.style.opacity = String(from);
      const animation = node.animate([{ opacity: from }, { opacity: to }], {
        duration: durationMs,
        easing: springLinear,
        fill: "forwards",
      });
      ease = animation;
      animation.onfinish = () => {
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

    const stopJumps = clock.onJump((jump) => {
      if (jump.kind !== "seek" || !playing) return;
      easeTo(opacityAt(keyframes, jump.toMs), true);
    });
    const stopBoundary = clock.onBoundary(
      () => null,
      (positionMs) => {
        const nowPlaying = clock.playing();
        if (nowPlaying === playing) return;
        playing = nowPlaying;
        easeTo(playing ? opacityAt(keyframes, positionMs) : restOpacity, playing);
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
