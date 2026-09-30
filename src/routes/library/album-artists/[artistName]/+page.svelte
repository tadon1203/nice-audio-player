<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import MediaDetailsHeader from "$lib/components/media-details/media-details-header.svelte";
  import { createAlbumArtist, createArtistAlbums } from "$lib/library/detail.svelte";
  import { libraryCommandErrorMessage } from "$lib/library/library-errors";
  import { artistAlbumSortOptions } from "$lib/library/sort";
  import { artistNameLabel, fromNameSegment } from "$lib/library/unknown-name";
  import { getPlayback } from "$lib/playback/context";
  import { libraryViews } from "$lib/shell/library-views.svelte";
  import { captureScroll, restoreScroll } from "$lib/shell/scroll-memory";
  import BackLink from "$lib/ui/back-link.svelte";
  import CollectionSortControl from "$lib/ui/collection-sort-control.svelte";
  import EmptyStatus from "$lib/ui/empty-status.svelte";
  import ErrorAlert from "$lib/ui/error-alert.svelte";
  import LoadMoreSentinel from "$lib/ui/load-more-sentinel.svelte";
  import LoadingStatus from "$lib/ui/loading-status.svelte";
  import VirtualMediaGrid from "$lib/ui/media-grid/virtual-media-grid.svelte";
  import PageTitle from "$lib/ui/page-title.svelte";
  import SectionTitle from "$lib/ui/section-title.svelte";
  import WorkspaceScroll from "$lib/ui/workspace-scroll.svelte";
  import { formatCount } from "$lib/utils/format";
  import AlbumTile from "../../album-tile.svelte";

  const view = libraryViews.artistAlbums;
  const playback = getPlayback();

  const name = $derived(fromNameSegment(page.params.artistName ?? ""));
  const key = $derived({ name });
  const label = $derived(artistNameLabel(name));

  const artistQuery = createAlbumArtist(() => key);
  const albums = createArtistAlbums(
    () => key,
    () => view.sortKey,
    () => view.direction,
  );

  let viewport = $state<HTMLElement | null>(null);

  // Back to the top when the sort changes, but not on first run.
  let previousKey: string | null = null;
  $effect(() => {
    const current = view.stateKey;
    const previous = previousKey;
    previousKey = current;
    if (previous === null || previous === current) return;
    viewport?.scrollTo({ top: 0 });
  });

  export const snapshot = {
    capture: () => captureScroll(viewport),
    restore: (offset: number) => restoreScroll(viewport, offset),
  };
</script>

<WorkspaceScroll bind:viewportRef={viewport} contentClass="py-8 pb-16">
  <BackLink href={resolve("/library/album-artists")}>Album Artists</BackLink>

  {#if artistQuery.isError}
    <ErrorAlert
      message={libraryCommandErrorMessage(artistQuery.error)}
      onRetry={() => void artistQuery.refetch()}
    />
  {:else if artistQuery.data === undefined || albums.isPending}
    <div class="mt-8">
      <PageTitle>{label}</PageTitle>
    </div>
    <LoadingStatus>Reading artist…</LoadingStatus>
  {:else if albums.isError}
    <ErrorAlert
      message={libraryCommandErrorMessage(albums.error)}
      onRetry={() => void albums.refetch()}
    />
  {:else}
    {@const artist = artistQuery.data}
    <MediaDetailsHeader title={label} artwork={artist.artwork} round>
      <p class="mt-2 flex flex-wrap gap-x-4 text-sm text-muted-foreground tabular-nums">
        <span>{formatCount(artist.albumCount, "album")}</span>
        <span>{formatCount(artist.trackCount, "track")}</span>
      </p>
    </MediaDetailsHeader>

    <section class="mt-10" aria-labelledby="artist-albums-title">
      <div class="mb-5 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <SectionTitle id="artist-albums-title">Albums</SectionTitle>
        <CollectionSortControl
          selectLabel="Sort artist albums"
          value={view.sortKey}
          options={artistAlbumSortOptions}
          direction={view.direction}
          onValueChange={(value) => view.setSort(value, "ascending")}
          onToggleDirection={view.toggleDirection}
        />
      </div>

      {#if albums.items.length > 0}
        <VirtualMediaGrid
          items={albums.items}
          scrollElement={viewport}
          itemKey={(album) => `${album.key.albumArtist}\u0000${album.key.title}`}
          artworkAt={(index) => albums.items[index]?.artwork}
          sortSignature="{view.sortKey}:{view.direction}"
        >
          {#snippet tile(album)}
            <AlbumTile
              {album}
              showArtist={false}
              onplay={(played) =>
                void playback.startPlayback({ kind: "album", key: played.key }, null)}
            />
          {/snippet}
        </VirtualMediaGrid>
        {#if albums.hasNextPage}
          <LoadMoreSentinel
            {viewport}
            pending={albums.isFetchingNextPage}
            onLoadMore={() => void albums.fetchNextPage()}
          />
        {/if}
      {:else}
        <EmptyStatus>No albums were indexed for this artist.</EmptyStatus>
      {/if}
    </section>
  {/if}
</WorkspaceScroll>
