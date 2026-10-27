<script lang="ts">
  import type { Snippet } from "svelte";
  import { Empty, EmptyDescription } from "#lib/components/ui/shadcn/empty/index.js";
  import { Spinner } from "#lib/components/ui/shadcn/spinner/index.js";

  let { loading = false, children }: { loading?: boolean; children: Snippet } = $props();
</script>

<!-- A workspace region with nothing to show, or, while `loading`, still reading its first data. -->
<Empty role="status" class="my-6 py-8">
  <EmptyDescription class={loading ? "flex items-center gap-2" : undefined}>
    {#if loading}
      <Spinner aria-hidden="true" role="presentation" />
    {/if}
    {@render children()}
  </EmptyDescription>
</Empty>
