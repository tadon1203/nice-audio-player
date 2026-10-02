<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { fade, type TransitionConfig } from "svelte/transition";
  import { motionFor } from "$lib/ui/motion/svelte-motion";

  /**
   * Text that flips over like a split-flap card when its value changes; an unchanged value does
   * not move, so a steady signal path stays still. Under reduced motion it crossfades.
   */
  let { value, class: className }: { value: string; class?: string } = $props();

  const reduced = $derived(prefersReducedMotion.current);

  /** Turns in from `from` degrees (and out to `-from`) while fading. */
  function flip(node: Element, { from }: { from: number }): TransitionConfig {
    if (reduced) return fade(node, motionFor("feedback"));
    const { duration, easing } = motionFor("move");
    return {
      duration,
      easing,
      css: (t, u) => `transform: rotateX(${from * u}deg); opacity: ${Math.min(1, t)}`,
    };
  }
</script>

<span class={className} style:perspective="400px">
  <span class="sr-only">{value}</span>
  <span aria-hidden="true" class="inline-grid">
    {#key value}
      <span
        data-glyph={value}
        class="inline-block whitespace-pre [grid-area:1/1] before:content-[attr(data-glyph)]"
        in:flip={{ from: -90 }}
        out:flip={{ from: 90 }}
        style:transform-origin="50% 50%"
      ></span>
    {/key}
  </span>
</span>
