<script lang="ts">
  import { untrack } from "svelte";
  import { Repeat } from "@lucide/svelte";
  import { fade } from "svelte/transition";
  import { prefersReducedMotion, Tween } from "svelte/motion";
  import { motionFor } from "$lib/ui/motion/svelte-motion";

  /** One turn of the icon per mode change; `one` drops a superscript 1 beside it. */
  let { mode }: { mode: string } = $props();

  const rotation = new Tween(0);
  let shown = untrack(() => mode);
  $effect(() => {
    if (mode === shown) return;
    shown = mode;
    const motion = motionFor("mediumMove", prefersReducedMotion.current);
    untrack(() => void rotation.set(rotation.target + 360, motion));
  });
  const motion = $derived(motionFor("mediumMove", prefersReducedMotion.current));

  function drop(_node: Element): {
    duration: number;
    easing: (t: number) => number;
    css: (t: number, u: number) => string;
  } {
    const reduced = prefersReducedMotion.current;
    return {
      ...motion,
      css: (t, u) => `transform: translateY(${reduced ? 0 : -6 * u}px); opacity: ${t}`,
    };
  }
</script>

<span class="flex" style:transform="rotate({rotation.current}deg)">
  <Repeat aria-hidden="true" />
</span>
{#if mode === "one"}
  <span
    aria-hidden="true"
    class="absolute top-0.5 right-0.5 text-sm leading-none"
    in:drop
    out:fade={{ duration: motion.duration }}
  >
    ¹
  </span>
{/if}
