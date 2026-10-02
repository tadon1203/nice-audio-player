import { untrack } from "svelte";
import { nowPlaying } from "./now-playing.svelte";
import { getMotionBudget } from "./motion-budget.svelte";
import { RetargetableSpring } from "$lib/ui/motion/retargetable-spring.svelte";
import { nowPlayingDuration } from "./now-playing-motion";

/** The spring counts as stopped within this share of the distance it travels. */
const PRECISION_OF_SPAN = 0.002;

/**
 * A number that follows Now Playing opening (`whenOpen`) and closing (`whenClosed`) on its one
 * timeline, so the dock's pieces move together. It is a spring, so reversing it mid-flight keeps
 * its velocity. Under reduced motion it jumps. Call during component initialization.
 */
export function createNowPlayingTween(whenClosed: number, whenOpen: number) {
  const budget = getMotionBudget();
  const spring = new RetargetableSpring(
    untrack(() => (nowPlaying.isOpen ? whenOpen : whenClosed)),
    { precision: Math.abs(whenOpen - whenClosed) * PRECISION_OF_SPAN },
  );
  $effect(() => {
    const open = nowPlaying.isOpen;
    const reduced = budget.current === "reduced";
    untrack(() => {
      spring.duration = nowPlayingDuration(open);
      spring.set(open ? whenOpen : whenClosed, { instant: reduced });
    });
  });
  $effect(() => () => spring.stop());
  return spring;
}
