<script lang="ts">
  import AlertCircle from "@lucide/svelte/icons/circle-alert";
  import { Alert, AlertAction, AlertDescription } from "#lib/components/ui/shadcn/alert/index.js";
  import { Button } from "#lib/components/ui/shadcn/button/index.js";

  let { message, onRetry }: { message: string; onRetry?: () => void } = $props();
</script>

<!-- A recoverable failure that owns the region it replaces. -->
<Alert variant="destructive" class="my-6" role="alert">
  <AlertCircle aria-hidden="true" />
  <AlertDescription>{message}</AlertDescription>
  {#if onRetry}
    <AlertAction>
      <Button type="button" variant="outline" size="compact" onclick={onRetry}>Retry</Button>
    </AlertAction>
  {/if}
</Alert>
