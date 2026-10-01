<script lang="ts">
  import FlapText from "$lib/ui/rolling-number/flap-text.svelte";
  import RollingNumber from "$lib/ui/rolling-number/rolling-number.svelte";

  let { label, visible }: { label: string | null; visible: boolean } = $props();
</script>

<!--
  The oversized, barely-there key of the list position (a letter, or a year that rolls like an odometer) behind a scrolling
  grid. It shows while scrolling and for a moment after, then fades. Decorative: aria-hidden, not
  shown in narrow containers (the parent must be a @container) or under forced colors.
-->
{#if label !== null}
  <div
    aria-hidden="true"
    data-slot="scroll-index"
    class="pointer-events-none absolute top-1/4 right-10 hidden text-[10rem] leading-none text-foreground/5 transition-opacity @min-[40rem]:block forced-colors:hidden"
    style:opacity={visible ? 1 : 0}
  >
    {#if /^\d+$/.test(label)}
      <RollingNumber value={label} class="tabular-nums" />
    {:else}
      <FlapText value={label} />
    {/if}
  </div>
{/if}
