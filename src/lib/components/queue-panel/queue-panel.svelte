<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import { getPlayback } from "$lib/playback/context";
  import { queuePanel } from "$lib/shell/queue-panel.svelte";
  import { Sheet, SheetContent, SheetHeader, SheetTitle } from "$lib/ui/shadcn/sheet";
  import QueueFooter from "./queue-footer.svelte";
  import QueueRow from "./queue-row.svelte";
  import { createShuffleCascade } from "./shuffle-cascade.svelte";
  import UpcomingList from "./upcoming-list.svelte";

  const playback = getPlayback();

  const queue = $derived(playback.queue);
  const history = $derived(queue?.history ?? []);
  const cascade = createShuffleCascade(
    () => playback.shuffleEnabled,
    () => queuePanel.isOpen,
  );

  let scrollElement = $state<HTMLDivElement | null>(null);
  let content = $state<HTMLDivElement | null>(null);

  // Opening the panel shows the current track at the top, with what was played above it.
  const showAtTop: Attachment<HTMLElement> = (node) => {
    node.scrollIntoView({ block: "start" });
  };
</script>

<!-- Not modal: the library stays visible and usable beside the queue, so there is no backdrop and
     a click elsewhere does not close it (Escape and the queue button do). -->
<Sheet
  open={queuePanel.isOpen}
  onOpenChange={(open) => (open ? queuePanel.open() : queuePanel.close())}
>
  <SheetContent
    side="right"
    overlay={false}
    showCloseButton={false}
    interactOutsideBehavior="ignore"
    trapFocus={false}
    preventScroll={false}
    class="w-80 gap-0 bg-popover/82 p-0 shadow-floating backdrop-blur-xl backdrop-saturate-150"
  >
    <SheetHeader class="border-b border-border pb-4">
      <SheetTitle>Queue</SheetTitle>
    </SheetHeader>
    <div bind:this={scrollElement} class="min-h-0 flex-1 overflow-y-auto py-2">
      <div bind:this={content}>
        {#each history as item (item.id)}
          <QueueRow {item} tone="past" onPlay={() => void playback.playQueueItem(item.id)} />
        {/each}
        {#if queue?.current}
          <div {@attach showAtTop}>
            <QueueRow item={queue.current} tone="current" />
          </div>
        {:else}
          <p class="px-4 py-6 text-sm text-muted-foreground">Nothing playing.</p>
        {/if}
        {#if queue && queue.upcomingCount > 0}
          <UpcomingList {scrollElement} {content} cascading={cascade.current} />
        {/if}
      </div>
    </div>
    <QueueFooter />
  </SheetContent>
</Sheet>
