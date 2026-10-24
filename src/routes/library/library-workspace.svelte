<script lang="ts" generics="Item, Key extends string">
  import type { Snippet } from "svelte";
  import { resolve } from "$app/paths";
  import type {
    LibraryPresentationMeta,
    LibraryScroll,
    WorkspaceCatalog,
  } from "#lib/library/library-workspace";
  import { errorMessage } from "#lib/native/messages";
  import { ScrollIndex } from "#lib/library/scroll-index";
  import { AppServices } from "#lib/shell/app-services.svelte";
  import { WorkspaceScroll } from "#lib/shell/workspace-scroll.svelte";
  import EmptyStatus from "#lib/ui/empty-status.svelte";
  import ErrorAlert from "#lib/ui/error-alert.svelte";
  import LoadMoreSentinel from "#lib/ui/load-more-sentinel.svelte";
  import LoadingStatus from "#lib/ui/loading-status.svelte";
  import ScrollIndexBadge from "#lib/ui/scroll-index-badge.svelte";
  import type { SortableView } from "#lib/ui/sort-option";
  import WorkspaceScrollRegion from "#lib/ui/workspace-scroll.svelte";
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

  let topIndex = $state(0);

  const { actions, scrollMemory } = AppServices.current();

  const workspaceScroll = new WorkspaceScroll(scrollMemory, {
    key: (): string => scrollKey,
    resetKey: (): string => stateKey,
    ready: (): boolean => catalog.items.length > 0,
  });

  const scrollIndexLabel = $derived(ScrollIndex.labelAt(catalog.index, skip + topIndex));

  const scroll = $derived<LibraryScroll>({
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
    <ScrollIndexBadge label={scrollIndexLabel} visible={workspaceScroll.scrolling} />
    {#if catalog.index.length > 1}
      <IndexRail
        buckets={catalog.index}
        current={scrollIndexLabel}
        onselect={(label) => onjump(ScrollIndex.skipTo(catalog.index, label) ?? 0)}
      />
    {/if}
    <WorkspaceScrollRegion viewportAttachment={workspaceScroll.attach} contentClass="pt-6 pb-16">
      {#if catalog.viewState === "loading"}
        <LoadingStatus>Loading library…</LoadingStatus>
      {:else if catalog.viewState === "statusError"}
        <ErrorAlert
          message={errorMessage(catalog.statusError)}
          onRetry={() => actions.run(() => catalog.refetchStatus(), "library")}
        />
      {:else if catalog.viewState === "unavailable"}
        <ErrorAlert message={catalog.statusMessage ?? ""} />
      {:else if catalog.viewState === "catalogError"}
        <ErrorAlert
          message={errorMessage(catalog.error)}
          onRetry={() => actions.run(() => catalog.refetch(), "library")}
        />
      {:else if catalog.viewState === "empty"}
        <EmptyStatus>
          {#if filter === ""}
            No {meta.plural} in your library.
            <a href={resolve("/settings")} class="text-foreground underline underline-offset-4">
              Add a music directory
            </a>
          {:else}
            No results for “{filter}”.
          {/if}
        </EmptyStatus>
      {:else}
        {@render content(catalog.items, scroll)}
        {#if catalog.hasNextPage}
          <LoadMoreSentinel
            pending={catalog.isFetchingNextPage}
            onLoadMore={() => actions.run(() => catalog.fetchNextPage(), "library")}
          />
        {/if}
      {/if}
    </WorkspaceScrollRegion>
  </div>
</div>
