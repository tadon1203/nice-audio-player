<script lang="ts" module>
  /** No transition: reduced motion gives everything a 100ms one, and the scroll target is measured right after the spacer changes. */
  const SPACER = "transition-none";
</script>

<script lang="ts">
  import Play from "@lucide/svelte/icons/play";
  import { getPlayback } from "$lib/playback/context";
  import { queuePanel } from "$lib/shell/queue-panel.svelte";
  import { flipMotion } from "$lib/ui/motion/svelte-flip";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import Artwork from "$lib/ui/artwork.svelte";
  import { cn } from "$lib/utils/cn.js";
  import { timeStateClass } from "$lib/ui/time-state";
  import { formatDuration } from "$lib/utils/format";
  import { EDGE_MASK } from "./anchor-column";
  import { createAnchorPadding } from "./anchor-column.svelte";
  import { createAnchorFollow } from "./anchor-follow.svelte";
  import { buildQueueRows, hiddenUpcomingCount } from "./queue-rows";

  /**
   * What really plays, in the order it plays: history (oldest first), the current track, then
   * what is upcoming. One list wherever Now Playing shows it (beside lyrics or alone); its text
   * is sized from the column's width (`cqi`), and the current track sits 40% from the top like
   * the current lyric line. It scrolls there when the current track changes, and only then.
   * Any other row can be played, which moves within the queue and so replaces nothing; the
   * Gutter numbers rows from the top of the queue. Editing stays in the queue panel.
   */
  let { class: className }: { class?: string } = $props();

  const playback = getPlayback();
  const history = $derived(playback.queue?.history ?? []);
  const current = $derived(playback.queue?.current ?? null);
  const upcoming = $derived(playback.queue?.upcoming ?? []);
  const upcomingCount = $derived(playback.queue?.upcomingCount ?? 0);
  const hidden = $derived(hiddenUpcomingCount(upcomingCount, upcoming.length));

  const anchor = createAnchorPadding();
  const follow = createAnchorFollow();
  let container = $state<HTMLDivElement | null>(null);
  const currentId = $derived(current?.id ?? null);
  const hasRows = $derived(current !== null || history.length + upcoming.length > 0);
  const rows = $derived(buildQueueRows(history, current, upcoming));
  /** Where the current track sits in `rows` (past rows are before it). */
  const currentIndex = $derived(history.length);

  // Luminance moves as a `move`, like a lyric line; under reduced motion it is the short crossfade.
  const motion = $derived(motionFor("move"));
  const transition = (property: string) => `${property} ${motion.duration}ms var(--motion-easing)`;

  const currentRow = () => container?.querySelector<HTMLElement>('[aria-current="true"]') ?? null;

  // The current row glides to the anchor when it changes, and only then; a column that has just
  // got rows, or was resized (it may also be shown again after being hidden), is set at once.
  let anchoredId: string | null = null;
  $effect(() => {
    const id = currentId;
    void hasRows;
    void anchor.height;
    const row = currentRow();
    if (!row) return;
    follow.scrollToRow(row, anchoredId !== null && id !== anchoredId ? "animate" : "instant");
    anchoredId = id;
  });
</script>

{#if hasRows}
  <div class={cn("relative h-full min-h-0", className)}>
    <div
      bind:this={container}
      {@attach anchor.attach}
      {@attach follow.attach}
      role="list"
      aria-label="Queue"
      class={cn("relative h-full overflow-y-auto", EDGE_MASK)}
    >
      <div aria-hidden="true" class={SPACER} style:height="{anchor.top}px"></div>
      {#each rows as item, index (item.id)}
        {@const isCurrent = current !== null && index === currentIndex}
        {@const isPast = index < currentIndex}
        <div animate:flipMotion role="listitem" aria-current={isCurrent ? "true" : undefined}>
          <button
            type="button"
            disabled={isCurrent}
            aria-label="Play {item.title}"
            onclick={() => void playback.playQueueItem(item.id)}
            style:transition={transition("color")}
            class={cn(
              "flex w-full cursor-pointer items-center gap-4 rounded-sm py-2 text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
              timeStateClass(isCurrent ? "present" : isPast ? "past" : "future"),
            )}
          >
            <span class="flex w-16 shrink-0 justify-end text-right text-sm tabular-nums">
              {#if isCurrent}
                <Play
                  aria-hidden="true"
                  class="size-3.5 fill-(--artwork-accent) text-(--artwork-accent)"
                />
              {:else}
                {index + 1}
              {/if}
            </span>
            <Artwork artwork={item.artwork} class="size-10 shrink-0 rounded-sm" />
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
        <div class="pl-20">
          <button
            type="button"
            onclick={() => queuePanel.open()}
            class="cursor-pointer rounded-sm px-1 py-2 text-left text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {hidden} more in the queue
          </button>
        </div>
      {/if}
      <div aria-hidden="true" class={SPACER} style:height="{anchor.bottom}px"></div>
    </div>
  </div>
{/if}
