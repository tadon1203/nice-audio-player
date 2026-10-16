<script lang="ts">
  import { AppServices } from "#lib/shell/app-services.svelte";
  import { ClearUpcoming } from "#lib/shell/clear-upcoming.svelte";
  import { Button } from "#lib/ui/shadcn/button";

  const { playback, actions, notices } = AppServices.current();
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
