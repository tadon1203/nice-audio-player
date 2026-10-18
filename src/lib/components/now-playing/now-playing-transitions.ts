import { prefersReducedMotion } from "svelte/motion";
import { fade } from "svelte/transition";
import { SvelteMotion } from "#lib/ui/motion/svelte-motion";
import { TokenTiming } from "#lib/ui/motion/token-timing";
import type { TransitionConfig } from "svelte/transition";

/** The transitions of the Now Playing layer. */
export class NowPlayingTransitions {
  /** How far the surface travels while lifting in, in px. Small: it is a lift, not a slide. */
  public static readonly liftPx = 24;

  /** Delay before the text and lyrics settle in, so the Sleeve lands first. */
  static readonly #contentDelayMs = TokenTiming.delayOf("large", 0.4);

  /** How far lyrics travel while a track change swaps them, in px: a nudge, not a slide. */
  static readonly #swapPx = 12;

  /**
   * A transition for what settles in behind the Sleeve (the info text, the right column): a fade
   * on the layer's own timeline, after a short delay so the Sleeve lands first. Use it with
   * `|global`, because the layer's transition is what plays when Now Playing opens.
   */
  public static readonly contentFade = (node: Element): TransitionConfig => {
    const reduced = prefersReducedMotion.current;
    return fade(node, {
      ...SvelteMotion.of("large"),
      delay: reduced ? 0 : NowPlayingTransitions.#contentDelayMs,
    });
  };

  /** A column that comes or goes while Now Playing is open (lyrics found or lost): a plain crossfade. */
  public static readonly columnFade = (node: Element): TransitionConfig =>
    fade(node, SvelteMotion.of("large"));

  /**
   * The lyrics column on a track change: the old lyrics leave and the new ones arrive crossfading,
   * with no delay. Going to the next track the old lyrics leave to the left; going back, to the
   * right; the new ones come from the opposite side. Under reduced motion it is the plain
   * crossfade.
   */
  public static readonly lyricsSwap = (
    _node: Element,
    { direction, leaving }: { direction: "next" | "previous"; leaving: boolean },
  ): { css: (t: number, u: number) => string; duration: number; easing: (t: number) => number } => {
    const motion = SvelteMotion.of("move");
    const sign = (direction === "next" ? -1 : 1) * (leaving ? 1 : -1);
    const distance = prefersReducedMotion.current ? 0 : NowPlayingTransitions.#swapPx;
    return {
      ...motion,
      css: (t: number, u: number): string => `opacity: ${t}; translate: ${sign * u * distance}px 0`,
    };
  };
}
