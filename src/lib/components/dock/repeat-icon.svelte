<script lang="ts">
  import { untrack } from "svelte";
  import { Repeat } from "@lucide/svelte";
  import { fade } from "svelte/transition";
  import { Tween } from "svelte/motion";
  import type { PlaybackRepeatMode } from "$lib/native";
  import { getMotionBudget } from "$lib/shell/motion-budget.svelte";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import { slideTransition } from "$lib/ui/motion/svelte-slide";

  /** One turn of the icon per mode change; `one` drops a superscript 1 beside it. */
  let { mode }: { mode: PlaybackRepeatMode } = $props();

  const budget = getMotionBudget();
  const reduced = $derived(budget.current === "reduced");
  const motion = $derived(motionFor("mediumMove", reduced));

  const rotation = new Tween(0);
  let shown = untrack(() => mode);
  $effect(() => {
    if (mode === shown) return;
    shown = mode;
    // With reduced motion the icon does not turn; the superscript's crossfade shows the change.
    if (reduced) return;
    untrack(() => void rotation.set(rotation.target + 360, motion));
  });

  const drop = (_node: Element) => slideTransition("mediumMove", reduced, { y: -6 });
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
