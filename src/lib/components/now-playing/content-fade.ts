import { prefersReducedMotion } from "svelte/motion";
import { fade } from "svelte/transition";
import { motionFor } from "$lib/ui/motion/svelte-motion";
import { CONTENT_DELAY_MS } from "./now-playing-layout";

/**
 * A transition for what settles in behind the Sleeve (the info text, the right column): a fade
 * on the layer's own timeline, after a short delay so the Sleeve lands first. Use it with
 * `|global`, because the layer's transition is what plays when Now Playing opens.
 */
export function contentFade(node: Element) {
  const reduced = prefersReducedMotion.current;
  return fade(node, { ...motionFor("largeMove", reduced), delay: reduced ? 0 : CONTENT_DELAY_MS });
}
