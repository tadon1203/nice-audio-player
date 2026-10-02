<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import { libraryScanFailureMessage } from "$lib/library/library-errors";
  import type { LibraryScanSnapshot } from "$lib/native";
  import { formatNumber } from "$lib/utils/format";

  /** What the last scan ended with: why it failed, or what it found. */
  let { scan }: { scan: LibraryScanSnapshot } = $props();

  const summary = $derived(
    `${formatNumber(scan.discoveredCount)} discovered, ${formatNumber(scan.inspectedCount)} inspected, ${formatNumber(scan.indexedCount)} indexed, ${formatNumber(scan.failedCount)} failed.`,
  );
</script>

{#if scan.state === "failed"}
  <p class="mt-4 text-sm text-destructive" role="alert">
    {libraryScanFailureMessage(scan.failureCode)}
  </p>
{:else if scan.state === "completed"}
  <p class="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
    <Check class="size-4" aria-hidden="true" />
    {summary}
  </p>
{/if}
