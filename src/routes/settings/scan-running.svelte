<script lang="ts">
  import { type ScanState } from "#lib/native/bindings";
  import RollingNumber from "#lib/components/ui/rolling-number/rolling-number.svelte";
  import { Progress } from "#lib/components/ui/shadcn/progress/index.js";
  import { CountFormat } from "#lib/utils/count-format";

  /** The running scan's counters, progress bar and current directory. */
  let { scan }: { scan: ScanState } = $props();

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
        <RollingNumber value={CountFormat.number(count.value)} />
        {count.label}
      </span>
    {/each}
  </div>
  <Progress
    class="mt-3"
    value={scan.progress === null ? null : scan.progress * 100}
    aria-label="Scan progress"
  />
  {#if scan.currentDirectory}
    <p class="mt-2 truncate text-sm">Current directory: {scan.currentDirectory.path}</p>
  {/if}
</div>
