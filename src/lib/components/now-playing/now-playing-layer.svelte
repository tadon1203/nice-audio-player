<script lang="ts">
  import type { Snippet } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { useApp } from "#lib/app/app.svelte";
  import { NowPlayingMotion } from "#lib/app/now-playing-motion";
  import { SvelteMotion } from "#lib/ui/motion/svelte-motion";
  import { NowPlayingTransitions } from "./now-playing-transitions";

  /**
   * The Now Playing layer: full width (sidebar included), from below the title bar to the top of
   * the dock, drawn over the library rather than instead of it. The surface lifts and fades in;
   * it is deliberately not clipped, so the Sleeve can travel in from the dock without being cut
   * off (the Artwork glow clips itself). The close affordance lives in the dock's own Sleeve slot, not
   * here: the same object never appears twice. Place it as a direct child of the shell grid.
   * Under reduced motion nothing travels and it is a plain crossfade.
   */
  let { children }: { children?: Snippet } = $props();

  const { motion, nowPlaying } = useApp();

  function lift(opening: boolean) {
    return (_node: Element): TransitionConfig => {
      const reduced = motion.reduced;
      const { duration, easing } = SvelteMotion.of("large");
      return {
        duration: opening || reduced ? duration : duration * NowPlayingMotion.EXIT_SPEED,
        easing,
        css: (t, u) =>
          `opacity: ${t}; transform: translateY(${reduced ? 0 : NowPlayingTransitions.liftPx * u}px)`,
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
