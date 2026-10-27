<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import { ScrollView } from "#lib/components/ui/scroll-view.svelte";
  import { useApp } from "#lib/app/app.svelte";
  import { Sheet, SheetContent, SheetHeader, SheetTitle } from "#lib/components/ui/shadcn/sheet";
  import QueueFooter from "./queue-footer.svelte";
  import QueueItem from "./queue-row.svelte";
  import { ShuffleCascade } from "./shuffle-cascade.svelte";
  import UpcomingList from "./upcoming-list.svelte";

  const app = useApp();
  const {
    player: playback,
    ui: { actions },
  } = app;

  const queue = $derived(playback.queue);
  const history = $derived(queue?.history ?? []);
  const cascade = new ShuffleCascade(
    () => playback.shuffleEnabled,
    () => app.ui.queuePanelOpen,
  );

  const scrollView = ScrollView.provide();

  // Opening the panel shows the current track at the top, with what was played above it.
  const showAtTop: Attachment<HTMLElement> = (node) => {
    node.scrollIntoView({ block: "start" });
  };
</script>

<!-- Not modal: the library stays visible and usable beside the queue, so there is no backdrop and
     a click elsewhere does not close it (Escape and the queue button do). -->
<Sheet open={app.ui.queuePanelOpen} onOpenChange={(open) => (app.ui.queuePanelOpen = open)}>
  <SheetContent
    side="right"
    class="w-80 gap-0 p-0"
    overlay={false}
    showCloseButton={false}
    interactOutsideBehavior="ignore"
    trapFocus={false}
    preventScroll={false}
  >
    <div class="border-b border-border">
      <SheetHeader>
        <SheetTitle>Queue</SheetTitle>
      </SheetHeader>
    </div>
    <div {@attach scrollView.attachViewport} class="min-h-0 flex-1 overflow-y-auto py-2">
      <div {@attach scrollView.attachContent}>
        {#each history as item (item.queueItemId)}
          <QueueItem
            {item}
            tone="past"
            onPlay={() => actions.run(() => playback.playerPlayQueueItem(item.queueItemId))}
          />
        {/each}
        {#if queue?.current}
          <div {@attach showAtTop}>
            <QueueItem item={queue.current} tone="current" />
          </div>
        {:else}
          <p class="px-4 py-6 text-sm text-muted-foreground">Nothing playing.</p>
        {/if}
        {#if queue && queue.upcomingCount > 0}
          <UpcomingList cascading={cascade.current} />
        {/if}
      </div>
    </div>
    <QueueFooter />
  </SheetContent>
</Sheet>
