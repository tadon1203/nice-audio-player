<script lang="ts">
  import { getPlayback } from "$lib/playback/context";
  import { Button } from "$lib/ui/shadcn/button";

  const playback = getPlayback();

  const queue = $derived(playback.queue);
  const upcomingCount = $derived(queue?.upcomingCount ?? 0);
</script>

{#if queue && upcomingCount > 0}
  <div class="border-t border-border p-3">
    <Button
      type="button"
      variant="quiet"
      size="compact"
      onclick={() => void playback.clearQueue()}
      class="w-full"
    >
      Clear upcoming
    </Button>
  </div>
{/if}
