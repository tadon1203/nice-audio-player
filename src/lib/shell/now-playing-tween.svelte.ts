import { untrack } from "svelte";
import { Tween } from "svelte/motion";
import { nowPlaying } from "./now-playing.svelte";
import { getMotionBudget } from "./motion-budget.svelte";
import { nowPlayingMotion } from "./now-playing-motion";

/**
 * A number that follows Now Playing opening (`whenOpen`) and closing (`whenClosed`) on its one
 * timeline, so the dock's pieces move together. Call during component initialization.
 */
export function createNowPlayingTween(whenClosed: number, whenOpen: number) {
  const budget = getMotionBudget();
  const tween = new Tween(untrack(() => (nowPlaying.isOpen ? whenOpen : whenClosed)));
  $effect(() => {
    const open = nowPlaying.isOpen;
    const motion = nowPlayingMotion(open, budget.current === "reduced");
    untrack(() => void tween.set(open ? whenOpen : whenClosed, motion));
  });
  return tween;
}
