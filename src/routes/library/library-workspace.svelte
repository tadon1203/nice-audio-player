<script lang="ts" module>
  import type { LibraryViewState } from "$lib/library/catalog.svelte";
  import type { LibraryIndexBucket } from "$lib/native";
  import type { SortableView } from "$lib/ui/sort-option";

  export type LibraryPresentationMeta = {
    title: string;
    singular: string;
    plural: string;
    searchLabel: string;
    searchPlaceholder: string;
  };

  export type LibraryScroll = {
    /** `null` until the scroll region has mounted. */
    viewport: HTMLElement | null;
    /** The list reports the index of its first visible item here (for the scroll index). */
    ontopindexchange: (index: number) => void;
  };

  /** What the workspace reads from `createLibraryCatalog`. */
  export type WorkspaceCatalog<Item> = {
    statusQuery: { error: unknown; refetch: () => unknown };
    statusMessage: string | null;
    viewState: LibraryViewState;
    updating: boolean;
    items: readonly Item[];
    totalCount: number | null;
    error: unknown;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
    refetch: () => unknown;
    /** The scroll index of the list's order; empty when the sort has none. */
    index: readonly LibraryIndexBucket[];
  };
</script>

<script lang="ts" generics="Item, Key extends string">
  import type { Snippet } from "svelte";
  import { resolve } from "$app/paths";
  import { libraryCommandErrorMessage } from "$lib/library/library-errors";
  import { labelAt, skipTo } from "$lib/library/scroll-index";
  import { createWorkspaceScroll } from "$lib/shell/workspace-scroll.svelte";
  import EmptyStatus from "$lib/ui/empty-status.svelte";
  import ErrorAlert from "$lib/ui/error-alert.svelte";
  import LoadMoreSentinel from "$lib/ui/load-more-sentinel.svelte";
  import LoadingStatus from "$lib/ui/loading-status.svelte";
  import ScrollIndex from "$lib/ui/scroll-index.svelte";
  import WorkspaceScroll from "$lib/ui/workspace-scroll.svelte";
  import IndexRail from "./index-rail.svelte";
  import LibraryToolbar from "./library-toolbar.svelte";

  let {
    meta,
    scrollKey,
    filter,
    onfilterchange,
    stateKey,
    sort,
    catalog,
    skip,
    onjump,
    content,
  }: {
    meta: LibraryPresentationMeta;
    /** The path of the view, under which its scroll position is remembered. */
    scrollKey: string;
    filter: string;
    onfilterchange: (filter: string) => void;
    /** Changes when the filter or sort does, returning the list to the top. */
    stateKey: string;
    sort?: SortableView<Key>;
    catalog: WorkspaceCatalog<Item>;
    /** Rows the list starts after (it begins at the letter jumped to). */
    skip: number;
    onjump: (skip: number) => void;
    content: Snippet<[readonly Item[], LibraryScroll]>;
  } = $props();

  let viewport = $state<HTMLElement | null>(null);
  let topIndex = $state(0);

  const workspaceScroll = createWorkspaceScroll({
    viewport: () => viewport,
    key: () => scrollKey,
    resetKey: () => stateKey,
    ready: () => catalog.items.length > 0,
  });

  const scrollIndexLabel = $derived(labelAt(catalog.index, skip + topIndex));

  const scroll = $derived<LibraryScroll>({
    viewport,
    ontopindexchange: (index) => (topIndex = index),
  });
</script>

<div class="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
  <LibraryToolbar
    title={meta.title}
    count={catalog.totalCount}
    singular={meta.singular}
    plural={meta.plural}
    searchLabel={meta.searchLabel}
    searchPlaceholder={meta.searchPlaceholder}
    {filter}
    updating={catalog.updating}
    {onfilterchange}
    {sort}
  />

  <div class="@container relative min-h-0">
    <ScrollIndex label={scrollIndexLabel} visible={workspaceScroll.scrolling} />
    {#if catalog.index.length > 1}
      <IndexRail
        buckets={catalog.index}
        current={scrollIndexLabel}
        onselect={(label) => onjump(skipTo(catalog.index, label) ?? 0)}
      />
    {/if}
    <WorkspaceScroll bind:viewportRef={viewport} contentClass="pt-6 pb-16">
      {#if catalog.viewState === "loading"}
        <LoadingStatus>Loading library…</LoadingStatus>
      {:else if catalog.viewState === "statusError"}
        <ErrorAlert
          message={libraryCommandErrorMessage(catalog.statusQuery.error)}
          onRetry={() => void catalog.statusQuery.refetch()}
        />
      {:else if catalog.viewState === "unavailable"}
        <ErrorAlert message={catalog.statusMessage ?? ""} />
      {:else if catalog.viewState === "catalogError"}
        <ErrorAlert
          message={libraryCommandErrorMessage(catalog.error)}
          onRetry={() => void catalog.refetch()}
        />
      {:else if catalog.viewState === "empty"}
        <EmptyStatus>
          {#if filter === ""}
            No {meta.plural} in your library.
            <a href={resolve("/settings")} class="text-foreground underline underline-offset-4">
              Add a music folder
            </a>
          {:else}
            No results for “{filter}”.
          {/if}
        </EmptyStatus>
      {:else}
        {@render content(catalog.items, scroll)}
        {#if catalog.hasNextPage}
          <LoadMoreSentinel
            {viewport}
            pending={catalog.isFetchingNextPage}
            onLoadMore={() => void catalog.fetchNextPage()}
          />
        {/if}
      {/if}
    </WorkspaceScroll>
  </div>
</div>
