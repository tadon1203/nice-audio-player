<script lang="ts">
  import { Button } from "$lib/ui/shadcn/button";
  import type { LibraryIndexBucket } from "$lib/native";

  let {
    buckets,
    current,
    onselect,
  }: {
    buckets: readonly LibraryIndexBucket[];
    current: string | null;
    onselect: (label: string) => void;
  } = $props();
</script>

<!-- Sits beside the workspace scrollbar (0.625rem wide at the edge), not over it. -->
<nav
  aria-label="Index"
  class="absolute inset-y-2 right-4 z-10 flex flex-col items-center overflow-y-auto"
>
  {#each buckets as bucket (bucket.label)}
    <Button
      type="button"
      aria-label={`Jump to ${bucket.label === "?" ? "names without a value" : bucket.label}`}
      aria-current={bucket.label === current ? "true" : undefined}
      variant="bare"
      size="inline"
      onclick={() => onselect(bucket.label)}
      class="h-auto min-h-6 w-auto min-w-6 shrink-0 px-1 py-0.5 font-normal"
    >
      {bucket.label === "?" ? "…" : bucket.label}
    </Button>
  {/each}
</nav>
