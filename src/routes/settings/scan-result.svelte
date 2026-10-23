<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  import { LibraryErrors } from "#lib/library/library-errors";
  import type { ScanState } from "#lib/native";
  import { CountFormat } from "#lib/utils/count-format";

  /** What the last scan ended with: why it failed, or what it found. */
  let { scan }: { scan: ScanState } = $props();

  const summary = $derived(
    `${CountFormat.number(scan.discoveredCount)} discovered, ${CountFormat.number(scan.inspectedCount)} inspected, ${CountFormat.number(scan.indexedCount)} indexed, ${CountFormat.number(scan.failedCount)} failed.`,
  );
</script>

{#if scan.state === "failed"}
  <p class="mt-4 text-sm text-destructive" role="alert">
    {LibraryErrors.scanFailureMessage(scan.failureCode)}
  </p>
{:else if scan.state === "completed"}
  <p class="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
    <Check class="size-4" aria-hidden="true" />
    {summary}
  </p>
{/if}
