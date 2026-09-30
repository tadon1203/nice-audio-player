<script lang="ts" generics="Key extends string">
  import Search from "@lucide/svelte/icons/search";
  import type { LibrarySortDirection } from "$lib/native";
  import CollectionSortControl from "$lib/ui/collection-sort-control.svelte";
  import PageTitle from "$lib/ui/page-title.svelte";
  import RollingNumber from "$lib/ui/rolling-number/rolling-number.svelte";
  import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
  } from "$lib/ui/shadcn/input-group/index.js";
  import type { SortOption } from "$lib/ui/sort-option";
  import WorkspaceContainer from "$lib/ui/workspace-container.svelte";

  let {
    title,
    countLabel,
    searchLabel,
    searchPlaceholder,
    filter,
    updating = false,
    onfilterchange,
    sort,
  }: {
    title: string;
    countLabel: string;
    searchLabel: string;
    searchPlaceholder: string;
    filter: string;
    updating?: boolean;
    onfilterchange: (value: string) => void;
    sort?: {
      key: Key;
      direction: LibrarySortDirection;
      options: readonly SortOption<Key>[];
      onkeychange: (key: Key) => void;
      ontoggledirection: () => void;
    };
  } = $props();

  // `1,284 albums`: the number rolls like a slot machine, the unit stays put.
  const countMatch = $derived(/^([\d,.]+)(\s.*)?$/.exec(countLabel));
</script>

<header class="pt-8">
  <WorkspaceContainer>
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-x-8 gap-y-3">
      <!-- Title and count share one baseline; search and sort share one row. -->
      <div class="flex min-w-0 items-baseline gap-4">
        <PageTitle>{title}</PageTitle>
        <span class="text-sm tabular-nums text-muted-foreground">
          {#if countMatch}
            <RollingNumber value={countMatch[1]!} settle="right-last" spin={1} />{countMatch[2]}
          {:else}
            {countLabel}
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
          <CollectionSortControl
            selectLabel="Sort {title.toLocaleLowerCase()}"
            value={sort.key}
            options={sort.options}
            direction={sort.direction}
            onValueChange={sort.onkeychange}
            onToggleDirection={sort.ontoggledirection}
          />
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
