<script lang="ts">
  import { useApp } from "#lib/app/app.svelte";
  import { Button } from "#lib/components/ui/shadcn/button";
  import type { Result } from "#lib/native/result";

  const {
    player: playback,
    ui: { actions, notices },
  } = useApp();

  /** Clears the upcoming queue, and offers to undo it when there was anything to clear. */
  const clearUpcoming = async (): Promise<Result<boolean>> => {
    const outcome = await playback.playerClearQueue();
    if (outcome.ok && outcome.value) notices.offerUndo("Upcoming cleared");
    return outcome;
  };

  const queue = $derived(playback.queue);
  const upcomingCount = $derived(queue?.upcomingCount ?? 0);
</script>

{#if queue && upcomingCount > 0}
  <div class="border-t border-border p-3">
    <Button
      type="button"
      variant="quiet"
      size="compact"
      onclick={() => actions.run(clearUpcoming)}
      class="w-full"
    >
      Clear upcoming
    </Button>
  </div>
{/if}
