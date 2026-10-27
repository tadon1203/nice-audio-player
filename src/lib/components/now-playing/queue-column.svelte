<script lang="ts" module>
  import { type QueueItemId } from "#lib/native/bindings";
  /** No transition: reduced motion gives everything a 100ms one, and the scroll target is measured right after the spacer changes. */
  const SPACER = "transition-none";
</script>

<script lang="ts">
  import { timeStateClass } from "#lib/ui/time-state";
  import { Button } from "#lib/ui/shadcn/button";
  import Play from "@lucide/svelte/icons/play";
  import { useApp } from "#lib/app/app.svelte";
  import { SvelteFlip } from "#lib/ui/motion/svelte-flip";
  /** The `animate:` of a row: a directive takes a name, not a member. */
  const flipRow = SvelteFlip.motion;
  import Artwork from "#lib/ui/artwork.svelte";
  import { cn } from "#lib/utils/cn.js";
  import { DurationFormat } from "#lib/utils/duration-format";
  import { AnchorColumn } from "./anchor-column";
  import { AnchorFollow } from "./anchor-follow.svelte";
  import { AnchorPadding } from "./anchor-padding.svelte";
  import { NowPlayingActions } from "./now-playing-actions.svelte";
  import { QueueRows } from "./queue-rows";

  /**
   * What really plays, in the order it plays: history (oldest first), the current track, then
   * what is upcoming. One list wherever Now Playing shows it (beside lyrics or alone); its text
   * is sized from the column's width (`cqi`), and the current track sits 40% from the top like
   * the current lyric line. It scrolls there when the current track changes, and only then.
   * Any other row can be played, which moves within the queue and so replaces nothing; the
   * Row index numbers rows from the top of the queue. Editing stays in the queue panel.
   */
  let { class: className }: { class?: string } = $props();

  const app = useApp();
  const { player: playback } = app;
  const actions = new NowPlayingActions();
  const history = $derived(playback.queue?.history ?? []);
  const current = $derived(playback.queue?.current ?? null);
  const upcoming = $derived(playback.queue?.upcoming ?? []);
  const upcomingCount = $derived(playback.queue?.upcomingCount ?? 0);
  const hidden = $derived(QueueRows.hiddenUpcomingCount(upcomingCount, upcoming.length));

  const anchor = new AnchorPadding();
  const follow = new AnchorFollow();
  let container = $state<HTMLDivElement | null>(null);
  const currentId = $derived(current?.queueItemId ?? null);
  const hasRows = $derived(current !== null || history.length + upcoming.length > 0);
  const rows = $derived(QueueRows.build(history, current, upcoming));
  /** Where the current track sits in `rows` (past rows are before it). */
  const currentIndex = $derived(history.length);

  const currentRow = (): HTMLElement | null =>
    container?.querySelector<HTMLElement>('[aria-current="true"]') ?? null;

  // The current row glides to the anchor when it changes, and only then; a column that has just
  // got rows, or was resized (it may also be shown again after being hidden), is set at once.
  let anchoredId: QueueItemId | null = null;
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
      class={cn("relative h-full overflow-y-auto", AnchorColumn.edgeMask)}
    >
      <div aria-hidden="true" class={SPACER} style:height="{anchor.top}px"></div>
      {#each rows as item, index (item.queueItemId)}
        {@const isCurrent = current !== null && index === currentIndex}
        {@const isPast = index < currentIndex}
        <div animate:flipRow role="listitem" aria-current={isCurrent ? "true" : undefined}>
          <Button
            type="button"
            disabled={isCurrent}
            aria-label="Play {item.title}"
            onclick={() => actions.playerPlayQueueItem(item.queueItemId)}
            variant="bare"
            size="inline"
            class={cn(
              "flex w-full items-center gap-4 rounded-sm py-2 text-left whitespace-normal disabled:opacity-100 active:translate-y-0 font-normal",
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
                <span class="shrink-0 tabular-nums">{DurationFormat.of(item.durationMs)}</span>
              </span>
            </span>
          </Button>
        </div>
      {/each}
      {#if upcomingCount === 0 && current !== null}
        <p class="py-2 pl-20 text-sm text-muted-foreground">Nothing else in the queue</p>
      {/if}
      {#if hidden > 0}
        <div role="listitem" class="pl-20">
          <Button
            type="button"
            onclick={() => (app.queuePanelOpen = true)}
            variant="text"
            size="compact"
            class="font-normal"
          >
            {hidden} more in the queue
          </Button>
        </div>
      {/if}
      <div aria-hidden="true" class={SPACER} style:height="{anchor.bottom}px"></div>
    </div>
  </div>
{/if}
