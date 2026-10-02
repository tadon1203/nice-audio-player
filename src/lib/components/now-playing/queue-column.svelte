<script lang="ts" module>
  export type QueueVariant = "full" | "rail";

  /** No transition: reduced motion gives everything a 100ms one, and the scroll target is measured right after the spacer changes. */
  const SPACER = "transition-none";
</script>

<script lang="ts">
  import Play from "@lucide/svelte/icons/play";
  import { getPlayback } from "$lib/playback/context";
  import { queuePanel } from "$lib/shell/queue-panel.svelte";
  import Artwork from "$lib/ui/artwork.svelte";
  import { cn } from "$lib/utils/cn.js";
  import { formatDuration } from "$lib/utils/format";
  import { anchorScrollTop, EDGE_MASK, opacityAtDistance } from "./anchor-column";
  import { createAnchorPadding } from "./anchor-column.svelte";
  import { buildQueueRows, gutterLabel, hiddenUpcomingCount } from "./queue-rows";

  /**
   * The right column when a track has no lyrics (`full`), or the narrow column beside lyrics on a
   * wide screen (`rail`): what really plays, in the order it plays. `full`: history (oldest
   * first), the current track, then what is upcoming, with the current one scrolled to 40% when
   * it changes, and only then. `rail`: only what is upcoming, from the top. Only upcoming rows
   * can be played, which moves within the queue and so replaces nothing.
   */
  let { variant, class: className }: { variant: QueueVariant; class?: string } = $props();

  const playback = getPlayback();
  const history = $derived(playback.queue?.history ?? []);
  const current = $derived(playback.queue?.current ?? null);
  const upcoming = $derived(playback.queue?.upcoming ?? []);
  const upcomingCount = $derived(playback.queue?.upcomingCount ?? 0);
  const hidden = $derived(hiddenUpcomingCount(upcomingCount, upcoming.length));

  const anchor = createAnchorPadding();
  let container = $state<HTMLDivElement | null>(null);
  const currentId = $derived(current?.id ?? null);
  const hasRows = $derived(current !== null || history.length + upcoming.length > 0);
  const rows = $derived(buildQueueRows(history, current, upcoming));

  // The current row goes to the anchor only when it changes (or the list first has rows, or the
  // column is resized), never when the queue merely changes around it.
  $effect(() => {
    void currentId;
    void hasRows;
    void anchor.height;
    const row = container?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!container || !row) return;
    container.scrollTop = anchorScrollTop({
      rowTop: row.offsetTop,
      rowHeight: row.offsetHeight,
      clientHeight: container.clientHeight,
      scrollHeight: container.scrollHeight,
    });
  });
</script>

{#snippet more()}
  <button
    type="button"
    onclick={() => queuePanel.open()}
    class="cursor-pointer rounded-sm px-1 py-2 text-left text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
  >
    {hidden} more in the queue
  </button>
{/snippet}

{#if variant === "rail"}
  {#if upcoming.length > 0}
    <div class={cn("flex h-full min-h-0 flex-col gap-2", className)}>
      <p class="text-sm text-muted-foreground">Up next</p>
      <div
        role="list"
        aria-label="Up next"
        class="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {#each upcoming as item (item.id)}
          <div role="listitem">
            <button
              type="button"
              aria-label="Play {item.title}"
              onclick={() => void playback.playQueueItem(item.id)}
              class="flex w-full cursor-pointer items-center gap-3 rounded-sm py-1.5 text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Artwork artwork={item.artwork} class="size-10 shrink-0 rounded-sm" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-base text-foreground">{item.title}</span>
                <span class="block truncate text-sm text-muted-foreground">{item.artist}</span>
              </span>
            </button>
          </div>
        {/each}
        {#if hidden > 0}
          {@render more()}
        {/if}
      </div>
    </div>
  {/if}
{:else if hasRows}
  <div class={cn("relative h-full min-h-0", className)}>
    <div
      bind:this={container}
      {@attach anchor.attach}
      role="list"
      aria-label="Queue"
      class={cn("relative h-full overflow-y-auto", EDGE_MASK)}
    >
      <div aria-hidden="true" class={SPACER} style:height="{anchor.top}px"></div>
      {#each rows as { item, offset }, index (item.id)}
        {@const isCurrent = offset === 0}
        {@const isPast = offset < 0}
        <div
          role="listitem"
          aria-current={isCurrent ? "true" : undefined}
          style:opacity={opacityAtDistance(Math.abs(index - history.length))}
          class={isCurrent
            ? "text-foreground"
            : isPast
              ? "text-faint-foreground"
              : "text-muted-foreground"}
        >
          <button
            type="button"
            disabled={offset <= 0}
            aria-label="Play {item.title}"
            onclick={() => void playback.playQueueItem(item.id)}
            class="flex w-full cursor-pointer items-baseline gap-4 rounded-sm py-2 text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
          >
            <span class="flex w-16 shrink-0 justify-end text-right text-sm tabular-nums">
              {#if isCurrent}
                <Play
                  aria-hidden="true"
                  class="size-3.5 translate-y-0.5 fill-(--artwork-accent) text-(--artwork-accent)"
                />
              {:else if offset > 0}
                {gutterLabel(offset)}
              {/if}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[clamp(1.125rem,3.2cqi,1.75rem)] leading-snug">
                {item.title}
              </span>
              <span class="flex gap-3 text-sm">
                <span class="min-w-0 flex-1 truncate">{item.artist}</span>
                <span class="shrink-0 tabular-nums">{formatDuration(item.durationMs)}</span>
              </span>
            </span>
          </button>
        </div>
      {/each}
      {#if upcomingCount === 0 && current !== null}
        <p class="py-2 pl-20 text-sm text-muted-foreground">Nothing else in the queue</p>
      {/if}
      {#if hidden > 0}
        <div class="pl-20">{@render more()}</div>
      {/if}
      <div aria-hidden="true" class={SPACER} style:height="{anchor.bottom}px"></div>
    </div>
  </div>
{/if}
