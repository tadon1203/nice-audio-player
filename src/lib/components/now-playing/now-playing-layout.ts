import { prefersReducedMotion } from "svelte/motion";
import { fade } from "svelte/transition";
import { motionFor } from "$lib/ui/motion/svelte-motion";
import { delayOf } from "$lib/ui/motion/tokens";

/**
 * One Sleeve size for every state. Container units resolve against the grid area (the layer
 * without the waveform band): its height minus the outer padding (4rem), the gap between the
 * Sleeve and the info (1rem) and the info block (~10rem), and never more than 38% of the width.
 */
export const SLEEVE_SIZE = "max(10rem, min(calc(100cqh - 15rem), 38cqw, 40rem))";

/** How far the surface travels while lifting in, in px. Small: it is a lift, not a slide. */
export const LIFT_PX = 24;

/** Delay before the text and lyrics settle in, so the Sleeve lands first. */
const CONTENT_DELAY_MS = delayOf("large", 0.4);

/** The waveform band's height for the room the layer has: it gives way to the content. */
export function waveformHeightFor(layerHeightPx: number): number {
  if (layerHeightPx >= 640) return 96;
  if (layerHeightPx >= 480) return 72;
  return 56;
}

/**
 * A transition for what settles in behind the Sleeve (the info text, the right column): a fade
 * on the layer's own timeline, after a short delay so the Sleeve lands first. Use it with
 * `|global`, because the layer's transition is what plays when Now Playing opens.
 */
export function contentFade(node: Element) {
  const reduced = prefersReducedMotion.current;
  return fade(node, { ...motionFor("large"), delay: reduced ? 0 : CONTENT_DELAY_MS });
}

/** A column that comes or goes while Now Playing is open (lyrics found or lost): a plain crossfade. */
export function columnFade(node: Element) {
  return fade(node, motionFor("large"));
}

/** How far lyrics travel while a track change swaps them, in px: a nudge, not a slide. */
const SWAP_PX = 12;

/**
 * The lyrics column on a track change: the old lyrics leave and the new ones arrive crossfading,
 * with no delay. Going to the next track the old lyrics leave to the left; going back, to the
 * right; the new ones come from the opposite side. Under reduced motion it is the plain
 * crossfade.
 */
export function lyricsSwap(
  _node: Element,
  { direction, leaving }: { direction: "next" | "previous"; leaving: boolean },
) {
  const motion = motionFor("move");
  const sign = (direction === "next" ? -1 : 1) * (leaving ? 1 : -1);
  const distance = prefersReducedMotion.current ? 0 : SWAP_PX;
  return {
    ...motion,
    css: (t: number, u: number) => `opacity: ${t}; translate: ${sign * u * distance}px 0`,
  };
}
