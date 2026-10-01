<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import type { TransitionConfig } from "svelte/transition";
  import { getPlayback } from "$lib/playback/context";
  import Artwork from "$lib/ui/artwork.svelte";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import { cn } from "$lib/utils/cn.js";

  /** The next track's artwork shows this long before the current one ends. */
  const PREVIEW_MS = 3_000;
  const SHOWN_OPACITY = 0.6;

  /**
   * In the last three seconds of a track, the next track's artwork slides in at the dock's edge
   * and goes when the track changes (the Sleeve's own slide takes over). Nothing shows for
   * repeat-one, at the end of the queue, or when the next artwork is the one already on the
   * Sleeve (the same artwork is never shown in two places). It watches the one playback clock and
   * only changes state when the last three seconds begin or end.
   */
  let { class: className }: { class?: string } = $props();

  const playback = getPlayback();
  let inLastSeconds = $state(false);

  $effect(() => {
    const total = playback.durationMs;
    if (total === null || playback.status !== "playing") {
      inLastSeconds = false;
      return;
    }
    const check = (positionMs: number) => {
      const remaining = total - positionMs;
      inLastSeconds = remaining > 0 && remaining <= PREVIEW_MS;
    };
    check(playback.clock.position.get());
    const release = playback.clock.retain();
    const unsubscribe = playback.clock.position.subscribe(check);
    return () => {
      unsubscribe();
      release();
      inLastSeconds = false;
    };
  });

  const next = $derived(playback.queue?.upcoming[0] ?? null);
  const show = $derived(
    next !== null &&
      inLastSeconds &&
      playback.repeatMode !== "one" &&
      next.artwork?.contentHash !== playback.item?.artwork?.contentHash,
  );

  function slideIn(_node: Element): TransitionConfig {
    const reduced = prefersReducedMotion.current;
    const { duration, easing } = motionFor("smallMove", reduced);
    return {
      duration,
      easing,
      css: (t, u) =>
        `transform: translateX(${reduced ? 0 : 8 * u}px); opacity: ${t * SHOWN_OPACITY}`,
    };
  }
</script>

{#if show && next !== null}
  {#key next.id}
    <span
      aria-hidden="true"
      data-slot="next-track-preview"
      in:slideIn
      out:slideIn
      style:opacity={SHOWN_OPACITY}
      class={cn("block size-6", className)}
    >
      <Artwork artwork={next.artwork} class="size-full rounded-sm" />
    </span>
  {/key}
{/if}
