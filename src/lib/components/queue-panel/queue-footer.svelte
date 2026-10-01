<script lang="ts" module>
  /** "Clear upcoming" can be undone up to this many tracks. */
  const MAX_UNDO_TRACKS = 200;
</script>

<script lang="ts">
  import { getPlayback } from "$lib/playback/context";
  import { Button } from "$lib/ui/shadcn/button";

  const playback = getPlayback();

  const queue = $derived(playback.queue);
  const upcomingCount = $derived(queue?.upcomingCount ?? 0);
  // What "Clear upcoming" removed, so it can be put back; forgotten when the track changes.
  const currentId = $derived(queue?.current?.id);
  let clearedState = $state<{ ids: string[]; forId: string | undefined }>({
    ids: [],
    forId: undefined,
  });
  const cleared = $derived(clearedState.forId === currentId ? clearedState.ids : []);

  function clearUpcoming() {
    if (queue === null) return;
    // Putting tracks back is one command each, so only a short list is worth undoing.
    clearedState = {
      ids:
        upcomingCount > MAX_UNDO_TRACKS
          ? []
          : queue.upcoming.flatMap((item) => (item.trackId ? [item.trackId] : [])),
      forId: currentId,
    };
    void playback.clearQueue();
  }

  async function undo() {
    const restore = cleared;
    clearedState = { ids: [], forId: currentId };
    for (const trackId of restore) await playback.enqueueTrack(trackId, false);
  }
</script>

{#if queue && upcomingCount > 0}
  <div class="border-t border-border p-3">
    <Button type="button" variant="ghost" size="sm" class="w-full" onclick={clearUpcoming}>
      Clear upcoming
    </Button>
  </div>
{:else if cleared.length > 0}
  <div
    role="status"
    class="flex items-center justify-between gap-2 border-t border-border p-3 text-sm text-muted-foreground"
  >
    {`Cleared ${cleared.length} ${cleared.length === 1 ? "track" : "tracks"}`}
    <Button type="button" variant="ghost" size="sm" onclick={() => void undo()}>Undo</Button>
  </div>
{/if}
