import { useEffect, useState } from "react";

/** How tiles change places for a moment after a sort: they slide, or (from far down) fade in. */
export type SortMotion = "slide" | "fade" | null;

/**
 * For a moment after `signature` (a sort key and direction) changes, says how a grid moves its
 * tiles: only for a sort, since typing in the filter changes the tiles too and must not animate.
 * A list that is scrolled down goes back to the top on a sort, so the tiles that were on screen
 * have nowhere to slide to: those fade in instead. `scrollElement` is where the grid scrolls.
 */
export function useSortMotion(signature: string, scrollElement: HTMLElement | null): SortMotion {
  const [seen, setSeen] = useState(signature);
  const [motion, setMotion] = useState<SortMotion>(null);
  if (seen !== signature) {
    setSeen(signature);
    setMotion(scrollElement !== null && scrollElement.scrollTop > 1 ? "fade" : "slide");
  }
  useEffect(() => {
    if (motion === null) return;
    const timer = setTimeout(() => setMotion(null), 800);
    return () => clearTimeout(timer);
  }, [motion, signature]);
  return motion;
}

/** For a grid that is not scrolled on its own: tiles slide after a sort. */
export function useSortFlip(signature: string): boolean {
  return useSortMotion(signature, null) === "slide";
}
