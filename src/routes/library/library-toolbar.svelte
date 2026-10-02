<script lang="ts" generics="Key extends string">
  import Search from "@lucide/svelte/icons/search";
  import CollectionSortControl from "$lib/ui/collection-sort-control.svelte";
  import PageTitle from "$lib/ui/page-title.svelte";
  import RollingNumber from "$lib/ui/rolling-number/rolling-number.svelte";
  import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
  } from "$lib/ui/shadcn/input-group/index.js";
  import type { SortableView } from "$lib/ui/sort-option";
  import WorkspaceContainer from "$lib/ui/workspace-container.svelte";
  import { formatNumber } from "$lib/utils/format";

  let {
    title,
    count,
    singular,
    plural,
    searchLabel,
    searchPlaceholder,
    filter,
    updating = false,
    onfilterchange,
    sort,
  }: {
    title: string;
    count: number | null;
    singular: string;
    plural: string;
    searchLabel: string;
    searchPlaceholder: string;
    filter: string;
    updating?: boolean;
    onfilterchange: (value: string) => void;
    sort?: SortableView<Key>;
  } = $props();

  // `1,284 albums`: the number rolls like a slot machine, the unit stays put.
  const unit = $derived(count === 1 ? singular : plural);
</script>

<header class="pt-8">
  <WorkspaceContainer>
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-x-8 gap-y-3">
      <!-- Title and count share one baseline; search and sort share one row. -->
      <div class="flex min-w-0 items-baseline gap-4">
        <PageTitle>{title}</PageTitle>
        <span class="text-sm tabular-nums text-muted-foreground">
          {#if count === null}
            {formatNumber(count)} {unit}
          {:else}
            <RollingNumber value={formatNumber(count)} settle="right-last" spin={1} />
            {unit}
          {/if}
        </span>
        {#if updating}
          <span role="status" aria-live="polite" class="text-sm text-muted-foreground">
            Updating…
          </span>
        {/if}
      </div>
      <div class="flex min-w-0 flex-wrap items-center gap-3">
        {#if sort}
          <CollectionSortControl selectLabel="Sort {title.toLocaleLowerCase()}" view={sort} />
        {/if}
        <InputGroup class="h-9 w-full sm:w-52">
          <InputGroupInput
            aria-label={searchLabel}
            data-library-filter=""
            value={filter}
            oninput={(event) => onfilterchange(event.currentTarget.value)}
            placeholder={searchPlaceholder}
            type="search"
          />
          <InputGroupAddon align="inline-start" aria-hidden="true">
            <Search class="size-4 text-muted-foreground" />
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  </WorkspaceContainer>
</header>
