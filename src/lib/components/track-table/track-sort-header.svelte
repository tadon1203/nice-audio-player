<script lang="ts">
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import { Sort } from "#lib/library/sort";
  import { type SortDirection, type TrackSortKey } from "#lib/native/bindings";
  import { Button } from "#lib/ui/shadcn/button/index.js";

  let {
    header,
    sortKey,
    active,
    direction,
    onsortchange,
  }: {
    header: string | null;
    sortKey: TrackSortKey;
    active: boolean;
    direction: SortDirection;
    onsortchange: (key: TrackSortKey, direction: SortDirection) => void;
  } = $props();
</script>

<Button
  type="button"
  variant="quiet"
  size="standard"
  aria-label="Sort by {Sort.trackLabels[sortKey]}"
  onclick={() => onsortchange(sortKey, active ? Sort.toggleDirection(direction) : "ascending")}
  class="-mx-2 h-8 px-2"
>
  <span>{header}</span>
  {#if active}
    {#if direction === "ascending"}
      <ArrowUp aria-hidden="true" />
    {:else}
      <ArrowDown aria-hidden="true" />
    {/if}
  {/if}
</Button>
