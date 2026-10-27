<script lang="ts">
  import { useApp } from "#lib/app/app.svelte";
  import { ClearUpcoming } from "#lib/app/clear-upcoming.svelte";
  import { Button } from "#lib/ui/shadcn/button";

  const { player: playback, actions, notices } = useApp();
  const clearUpcoming = new ClearUpcoming(playback, notices);

  const queue = $derived(playback.queue);
  const upcomingCount = $derived(queue?.upcomingCount ?? 0);
</script>

{#if queue && upcomingCount > 0}
  <div class="border-t border-border p-3">
    <Button
      type="button"
      variant="quiet"
      size="compact"
      onclick={() => actions.run(() => clearUpcoming.run())}
      class="w-full"
    >
      Clear upcoming
    </Button>
  </div>
{/if}
