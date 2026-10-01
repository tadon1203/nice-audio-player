import { untrack } from "svelte";
import { Spring } from "svelte/motion";
import { nowPlaying } from "./now-playing.svelte";
import { getMotionBudget } from "./motion-budget.svelte";
import { settle } from "$lib/ui/motion/tokens";
import { nowPlayingSpring } from "./now-playing-motion";

/**
 * A number that follows Now Playing opening (`whenOpen`) and closing (`whenClosed`) on its one
 * timeline, so the dock's pieces move together. It is a spring, so reversing it mid-flight keeps
 * its velocity. Under reduced motion it jumps. Call during component initialization.
 */
export function createNowPlayingTween(whenClosed: number, whenOpen: number) {
  const budget = getMotionBudget();
  const spring = new Spring(
    untrack(() => (nowPlaying.isOpen ? whenOpen : whenClosed)),
    settle,
  );
  $effect(() => {
    const open = nowPlaying.isOpen;
    const reduced = budget.current === "reduced";
    untrack(() => {
      const target = open ? whenOpen : whenClosed;
      if (reduced) {
        void spring.set(target, { instant: true });
        return;
      }
      Object.assign(spring, nowPlayingSpring(open));
      spring.target = target;
    });
  });
  return spring;
}
