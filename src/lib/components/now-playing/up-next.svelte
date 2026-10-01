<script lang="ts">
  import { getPlayback } from "$lib/playback/context";
  import { queuePanel } from "$lib/shell/queue-panel.svelte";
  import Artwork from "$lib/ui/artwork.svelte";
  import { cn } from "$lib/utils/cn.js";

  /**
   * The next track at the end of the waveform band, close to the time axis it will follow: a
   * fixed-width slot, so the waveform's width only changes with the layout and never with the
   * queue. Opens the queue panel. Its second line gives way on a narrow layer.
   */
  let { class: className }: { class?: string } = $props();

  const playback = getPlayback();
  const next = $derived(playback.queue?.upcoming[0]);
</script>

<button
  type="button"
  aria-label={next === undefined
    ? "End of queue. Open the queue"
    : `Up next: ${next.title}. Open the queue`}
  onclick={() => queuePanel.open()}
  class={cn(
    "flex w-64 shrink-0 cursor-pointer items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  )}
>
  {#if next === undefined}
    <span class="text-sm text-muted-foreground">End of queue</span>
  {:else}
    <Artwork artwork={next.artwork} class="size-8 shrink-0 rounded-sm" />
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm text-foreground">{next.title}</span>
      {#if next.artist}
        <span class="block truncate text-sm text-muted-foreground @max-[40rem]/npw:hidden">
          {next.artist}
        </span>
      {/if}
    </span>
  {/if}
</button>
