<script lang="ts">
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
    <button
      type="button"
      aria-label={`Jump to ${bucket.label === "?" ? "names without a value" : bucket.label}`}
      aria-current={bucket.label === current ? "true" : undefined}
      class={[
        "grid size-6 shrink-0 place-items-center rounded-md text-sm tabular-nums outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        bucket.label === current ? "text-foreground" : "text-muted-foreground",
      ]}
      onclick={() => onselect(bucket.label)}
    >
      {bucket.label === "?" ? "…" : bucket.label}
    </button>
  {/each}
</nav>
