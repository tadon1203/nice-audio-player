<script lang="ts">
  import ArrowDown from "@lucide/svelte/icons/arrow-down";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import { toggleSortDirection, trackSortLabels } from "$lib/library/sort";
  import type { LibrarySortDirection, LibraryTrackSortKey } from "$lib/native";
  import { Button } from "$lib/ui/shadcn/button/index.js";

  let {
    header,
    sortKey,
    active,
    direction,
    onsortchange,
  }: {
    header: string | null;
    sortKey: LibraryTrackSortKey;
    active: boolean;
    direction: LibrarySortDirection;
    onsortchange: (key: LibraryTrackSortKey, direction: LibrarySortDirection) => void;
  } = $props();
</script>

<Button
  type="button"
  purpose="quiet"
  density="standard"
  geometry="tableSort"
  aria-label="Sort by {trackSortLabels[sortKey]}"
  onclick={() => onsortchange(sortKey, active ? toggleSortDirection(direction) : "ascending")}
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
