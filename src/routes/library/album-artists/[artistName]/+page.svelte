<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import MediaDetailsHeader from "$lib/components/media-details/media-details-header.svelte";
  import { albumItemKey } from "$lib/library/album-key";
  import { createAlbumArtist, createArtistAlbums } from "$lib/library/detail.svelte";
  import { libraryCommandErrorMessage } from "$lib/library/library-errors";
  import { artistNameLabel, fromNameSegment } from "$lib/library/unknown-name";
  import { getPlayback } from "$lib/playback/context";
  import { libraryViews } from "$lib/shell/library-views.svelte";
  import { createWorkspaceScroll } from "$lib/shell/workspace-scroll.svelte";
  import BackLink from "$lib/ui/back-link.svelte";
  import CollectionSortControl from "$lib/ui/collection-sort-control.svelte";
  import EmptyStatus from "$lib/ui/empty-status.svelte";
  import ErrorAlert from "$lib/ui/error-alert.svelte";
  import FactLine from "$lib/ui/fact-line.svelte";
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

  const scroll = createWorkspaceScroll({
    viewport: () => viewport,
    resetKey: () => view.stateKey,
    ready: () => artistQuery.data !== undefined && !albums.isPending && albums.items.length > 0,
  });

  export const snapshot = {
    capture: () => scroll.capture(),
    restore: (offset: number) => scroll.restore(offset),
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
      <div class="mt-2">
        <FactLine
          facts={[formatCount(artist.albumCount, "album"), formatCount(artist.trackCount, "track")]}
        />
      </div>
    </MediaDetailsHeader>

    <section class="mt-10" aria-labelledby="artist-albums-title">
      <div class="mb-5 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <SectionTitle id="artist-albums-title">Albums</SectionTitle>
        <CollectionSortControl selectLabel="Sort artist albums" {view} />
      </div>

      {#if albums.items.length > 0}
        <VirtualMediaGrid
          items={albums.items}
          scrollElement={viewport}
          itemKey={(album) => albumItemKey(album.key)}
          artworkAt={(index) => albums.items[index]?.artwork}
          sortSignature={view.sortSignature}
        >
          {#snippet tile(album)}
            <AlbumTile
              {album}
              showArtist={false}
              parentArtist={name}
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
