<script lang="ts">
  import type { LibraryScanSnapshot } from "$lib/native";
  import RollingNumber from "$lib/ui/rolling-number/rolling-number.svelte";
  import { Progress } from "$lib/ui/shadcn/progress/index.js";
  import { formatNumber } from "$lib/utils/format";
  import { scanShare } from "./scan-status";

  /** The running scan's counters, progress bar and current folder. */
  let { scan }: { scan: LibraryScanSnapshot } = $props();

  const counts = $derived([
    { value: scan.discoveredCount, label: "discovered" },
    { value: scan.inspectedCount, label: "inspected" },
    { value: scan.indexedCount, label: "indexed" },
    { value: scan.failedCount, label: "failed" },
  ]);
</script>

<div
  class="mt-4 rounded-md border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
>
  <div class="flex flex-wrap gap-x-5 gap-y-1">
    {#each counts as count (count.label)}
      <!-- A running scan's counter: the number rolls as files are found, inspected and indexed. -->
      <span class="tabular-nums">
        <RollingNumber value={formatNumber(count.value)} />
        {count.label}
      </span>
    {/each}
  </div>
  <Progress class="mt-3" value={scanShare(scan)} aria-label="Scan progress" />
  {#if scan.currentRoot}
    <p class="mt-2 truncate text-sm">Current folder: {scan.currentRoot.path}</p>
  {/if}
</div>
