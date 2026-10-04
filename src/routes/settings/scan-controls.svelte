<script lang="ts">
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import X from "@lucide/svelte/icons/x";
  import { createLibraryScan } from "$lib/library/detail.svelte";
  import { libraryCommandErrorMessage } from "$lib/library/library-errors";
  import { createCancelLibraryScan, createStartLibraryScan } from "$lib/library/mutations";
  import { Button } from "$lib/ui/shadcn/button/index.js";
  import { scanLabel } from "./scan-status";

  /** The scan's state in words, and the button that starts or cancels it. */
  let { rootCount }: { rootCount: number } = $props();

  const scanQuery = createLibraryScan();
  const startScan = createStartLibraryScan();
  const cancelScan = createCancelLibraryScan();

  const scan = $derived(scanQuery.data);
  const error = $derived(startScan.error ?? cancelScan.error ?? scanQuery.error);
</script>

<div class="flex max-w-sm flex-col items-end gap-2">
  <div class="flex items-center gap-2">
    <span role="status" aria-live="polite" class="text-sm text-muted-foreground">
      {scanLabel(scan?.state)}
    </span>
    {#if scan?.state === "running"}
      <Button
        type="button"
        purpose="outline"
        onclick={() => {
          cancelScan.reset();
          cancelScan.mutate();
        }}
        disabled={cancelScan.isPending}
      >
        <X data-icon="inline-start" aria-hidden="true" />
        Cancel scan
      </Button>
    {:else}
      <Button
        type="button"
        purpose="outline"
        onclick={() => {
          startScan.reset();
          startScan.mutate();
        }}
        disabled={scanQuery.isPending || rootCount === 0 || startScan.isPending}
      >
        <RefreshCw data-icon="inline-start" aria-hidden="true" />
        Rescan
      </Button>
    {/if}
  </div>
  {#if error}
    <p class="text-right text-sm text-destructive" role="alert">
      {libraryCommandErrorMessage(error)}
    </p>
  {/if}
</div>
