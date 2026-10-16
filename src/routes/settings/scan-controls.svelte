<script lang="ts">
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import X from "@lucide/svelte/icons/x";
  import { getLibraryScan } from "#lib/library/context";
  import { libraryCommandErrorMessage } from "#lib/library/library-errors";
  import { createCancelLibraryScan, createStartLibraryScan } from "#lib/library/mutations";
  import { Button } from "#lib/ui/shadcn/button/index.js";
  import { scanLabel } from "./scan-status";

  /** The scan's state in words, and the button that starts or cancels it. */
  let { rootCount }: { rootCount: number } = $props();

  const scanState = getLibraryScan();
  const startScan = createStartLibraryScan();
  const cancelScan = createCancelLibraryScan();

  const scan = $derived(scanState.snapshot);
  const error = $derived(startScan.error ?? cancelScan.error);
</script>

<div class="flex max-w-sm flex-col items-end gap-2">
  <div class="flex items-center gap-2">
    <span role="status" aria-live="polite" class="text-sm text-muted-foreground">
      {scanLabel(scan?.state)}
    </span>
    {#if scan?.state === "running"}
      <Button
        type="button"
        variant="outline"
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
        variant="outline"
        onclick={() => {
          startScan.reset();
          startScan.mutate();
        }}
        disabled={scan === null || rootCount === 0 || startScan.isPending}
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
