<script lang="ts">
  import { untrack } from "svelte";
  import Repeat from "@lucide/svelte/icons/repeat";
  import { fade } from "svelte/transition";
  import { Tween } from "svelte/motion";
  import { type RepeatMode } from "#lib/native/bindings";
  import { useApp } from "#lib/app/app.svelte";
  import { SvelteMotion } from "#lib/components/ui/motion/svelte-motion";
  import { SvelteSlide } from "#lib/components/ui/motion/svelte-slide";
  import type { TransitionConfig } from "svelte/transition";

  /** One turn of the icon per mode change; `one` drops a superscript 1 beside it. */
  let { mode }: { mode: RepeatMode } = $props();

  const appMotion = useApp().motion;
  const reduced = $derived(appMotion.reduced);
  const motion = $derived(SvelteMotion.of("move"));

  const rotation = new Tween(0);
  let shown = untrack(() => mode);
  // `$effect` stays: the turn starts when the `mode` prop changes, which no subscriber or
  // attachment observes.
  $effect(() => {
    if (mode === shown) return;
    shown = mode;
    // With reduced motion the icon does not turn; the superscript's crossfade shows the change.
    if (reduced) return;
    untrack(() => void rotation.set(rotation.target + 360, motion));
  });

  const drop = (_node: Element): TransitionConfig =>
    SvelteSlide.transition("move", reduced, { y: -6 });
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
