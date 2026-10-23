<script lang="ts">
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import X from "@lucide/svelte/icons/x";
  import { AppServices } from "#lib/shell/app-services.svelte";
  import { Button } from "#lib/ui/shadcn/button/index.js";
  import { ScanStatus } from "./scan-status";

  /** The scan's state in words, and the button that starts or cancels it. */
  let { directoryCount }: { directoryCount: number } = $props();

  const { actions, libraryDirectories, scan: scanWatcher } = AppServices.current();

  const scan = $derived(scanWatcher.snapshot);
</script>

<div class="flex max-w-sm flex-col items-end gap-2">
  <div class="flex items-center gap-2">
    <span role="status" aria-live="polite" class="text-sm text-muted-foreground">
      {ScanStatus.label(scan?.state)}
    </span>
    {#if scan?.state === "running"}
      <Button
        type="button"
        variant="outline"
        onclick={() => actions.run(() => libraryDirectories.cancelScan(), "library")}
      >
        <X data-icon="inline-start" aria-hidden="true" />
        Cancel scan
      </Button>
    {:else}
      <Button
        type="button"
        variant="outline"
        onclick={() => actions.run(() => libraryDirectories.startScan(), "library")}
        disabled={scan === null || directoryCount === 0 || actions.isRunning("library")}
      >
        <RefreshCw data-icon="inline-start" aria-hidden="true" />
        Rescan
      </Button>
    {/if}
  </div>
</div>
