<script lang="ts">
  import { Button } from "#lib/ui/shadcn/button";
  import { type LetterIndexEntry } from "#lib/native/bindings";

  let {
    entries,
    current,
    onselect,
  }: {
    entries: readonly LetterIndexEntry[];
    current: string | null;
    onselect: (label: string) => void;
  } = $props();
</script>

<!-- Sits beside the workspace scrollbar (0.625rem wide at the edge), not over it. -->
<nav
  aria-label="Index"
  class="absolute inset-y-2 right-4 z-10 flex flex-col items-center overflow-y-auto"
>
  {#each entries as entry (entry.label)}
    <Button
      type="button"
      aria-label={`Jump to ${entry.kind === "unknown" ? "names without a value" : entry.label}`}
      aria-current={entry.label === current ? "true" : undefined}
      variant="bare"
      size="inline"
      onclick={() => onselect(entry.label)}
      class="h-auto min-h-6 w-auto min-w-6 shrink-0 px-1 py-0.5 font-normal"
    >
      {entry.kind === "unknown" ? "…" : entry.label}
    </Button>
  {/each}
</nav>
