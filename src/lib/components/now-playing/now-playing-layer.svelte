<script lang="ts">
  import type { Snippet } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { getMotionBudget } from "$lib/shell/motion-budget.svelte";
  import { nowPlaying } from "$lib/shell/now-playing.svelte";
  import { nowPlayingMotion } from "$lib/shell/now-playing-motion";
  import { LIFT_PX } from "./now-playing-layout";

  /**
   * The Now Playing layer: full width (sidebar included), from below the title bar to the top of
   * the dock, drawn over the library rather than instead of it. The surface lifts and fades in;
   * it is deliberately not clipped, so the Sleeve can travel in from the dock without being cut
   * off (the Light clips itself). The close affordance lives in the dock's own Sleeve slot, not
   * here: the same object never appears twice. Place it as a direct child of the shell grid.
   * Under reduced motion nothing travels and it is a plain crossfade.
   */
  let { children }: { children?: Snippet } = $props();

  const budget = getMotionBudget();

  function lift(opening: boolean) {
    return (_node: Element): TransitionConfig => {
      const reduced = budget.current === "reduced";
      const { duration, easing } = nowPlayingMotion(opening, reduced);
      return {
        duration,
        easing,
        css: (t, u) => `opacity: ${t}; transform: translateY(${reduced ? 0 : LIFT_PX * u}px)`,
      };
    };
  }
  const liftIn = lift(true);
  const liftOut = lift(false);
</script>

{#if nowPlaying.isOpen}
  <section
    aria-label="Now Playing"
    data-slot="now-playing"
    in:liftIn
    out:liftOut
    class="relative z-10 col-span-full row-start-2 min-h-0 min-w-0 bg-background"
  >
    {@render children?.()}
  </section>
{/if}
