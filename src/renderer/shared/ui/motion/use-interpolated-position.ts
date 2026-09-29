import { useEffect, useRef } from "react";
import { animate, useMotionValue, type MotionValue } from "motion/react";
import { estimatePosition, isSeekJump, type PositionAnchor } from "./interpolate-position";
import { useMotionTransition } from "./use-motion-transition";

/**
 * The playback position in ms as a motion value that advances every frame while playing, so
 * consumers can bind it to styles (`useTransform`) without re-rendering. Each new report
 * re-anchors the clock; a report that disagrees with the estimate (a seek, a new track)
 * springs to the new position instead of snapping. `immediate` (dragging) follows `positionMs`
 * 1:1 with no easing.
 */
export function useInterpolatedPosition({
  positionMs,
  durationMs,
  playing,
  immediate = false,
}: {
  positionMs: number;
  durationMs: number | null;
  playing: boolean;
  immediate?: boolean;
}): MotionValue<number> {
  const value = useMotionValue(positionMs);
  const jumpTransition = useMotionTransition("smallMove");
  // The spring is not a dependency: re-anchoring when the token resolves again would restart it.
  const jumpTransitionRef = useRef(jumpTransition);
  jumpTransitionRef.current = jumpTransition;

  useEffect(() => {
    let frame = 0;
    let cancelled = false;
    let spring: ReturnType<typeof animate> | null = null;
    const anchor: PositionAnchor = { positionMs, atMs: performance.now() };

    const run = () => {
      if (!playing) return;
      const step = () => {
        value.set(estimatePosition(anchor, performance.now(), true, durationMs));
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    const estimate = value.get();
    if (immediate || !isSeekJump(estimate, positionMs)) {
      value.set(positionMs);
      run();
    } else {
      spring = animate(value, positionMs, jumpTransitionRef.current);
      void spring.then(() => {
        if (cancelled) return;
        anchor.atMs = performance.now();
        run();
      });
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      spring?.stop();
    };
  }, [value, positionMs, durationMs, playing, immediate]);

  return value;
}
