<script lang="ts">
  import type { Snippet } from "svelte";
  import { Empty, EmptyDescription } from "$lib/ui/shadcn/empty/index.js";
  import { Spinner } from "$lib/ui/shadcn/spinner/index.js";

  let { children }: { children: Snippet } = $props();
</script>

<!-- A workspace region that is still reading its first data. -->
<Empty role="status" class="my-6 py-8">
  <EmptyDescription class="flex items-center gap-2">
    <Spinner aria-hidden="true" role="presentation" />
    {@render children()}
  </EmptyDescription>
</Empty>
