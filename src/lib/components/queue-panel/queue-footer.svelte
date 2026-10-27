<script lang="ts">
  import { useApp } from "#lib/app/app.svelte";
  import { Button } from "#lib/components/ui/shadcn/button";

  const { player: playback, actions } = useApp();

  const queue = $derived(playback.queue);
  const upcomingCount = $derived(queue?.upcomingCount ?? 0);
</script>

{#if queue && upcomingCount > 0}
  <div class="border-t border-border p-3">
    <Button
      type="button"
      variant="quiet"
      size="compact"
      onclick={() => actions.run(() => playback.clearUpcoming())}
      class="w-full"
    >
      Clear upcoming
    </Button>
  </div>
{/if}
