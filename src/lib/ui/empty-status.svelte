<script lang="ts">
  import type { Snippet } from "svelte";
  import { Empty, EmptyDescription } from "$lib/ui/shadcn/empty/index.js";

  let { children }: { children: Snippet } = $props();
</script>

<!-- A workspace region with nothing to show. -->
<Empty role="status" class="my-6 py-8">
  <EmptyDescription>{@render children()}</EmptyDescription>
</Empty>
