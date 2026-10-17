<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import MediaDetailsHeader from "#lib/components/media-details/media-details-header.svelte";
  import { LibraryErrors } from "#lib/library/library-errors";
  import { PagedCollection } from "#lib/library/paged-collection.svelte";
  import { QueryResult } from "#lib/library/query-result.svelte";
  import { artistNameLabel } from "#lib/library/unknown-name";
  import { AppServices } from "#lib/shell/app-services.svelte";
  import { WorkspaceScroll } from "#lib/shell/workspace-scroll.svelte";
  import BackLink from "#lib/ui/back-link.svelte";
  import CollectionSortControl from "#lib/ui/collection-sort-control.svelte";
  import EmptyStatus from "#lib/ui/empty-status.svelte";
  import ErrorAlert from "#lib/ui/error-alert.svelte";
  import FactLine from "#lib/ui/fact-line.svelte";
  import LoadMoreSentinel from "#lib/ui/load-more-sentinel.svelte";
  import LoadingStatus from "#lib/ui/loading-status.svelte";
  import VirtualMediaGrid from "#lib/ui/media-grid/virtual-media-grid.svelte";
  import PageTitle from "#lib/ui/page-title.svelte";
  import SectionTitle from "#lib/ui/section-title.svelte";
  import WorkspaceScrollRegion from "#lib/ui/workspace-scroll.svelte";
  import { CountFormat } from "#lib/utils/count-format";
  import AlbumTile from "../../album-tile.svelte";

  const { actions, artists, libraryViews, playback, scrollMemory } = AppServices.current();
  const view = libraryViews.artistAlbums;

  const artistId = $derived(page.params.artistId ?? "");

  const artistQuery = new QueryResult(() => artists.detailsOptions(artistId));
  const albums = new PagedCollection(() =>
    artists.albumsOptions({ artistId, sortKey: view.sortKey, direction: view.direction }),
  );

  let viewport = $state<HTMLElement | null>(null);

  const scroll = new WorkspaceScroll(scrollMemory, {
    resetKey: () => view.stateKey,
    ready: () => artistQuery.data !== undefined && !albums.isPending && albums.items.length > 0,
  });

  export const snapshot = scrollMemory.detailSnapshot(scroll.capture, scroll.restore);
</script>

<WorkspaceScrollRegion
  bind:viewportRef={viewport}
  viewportAttachment={scroll.attach}
  contentClass="py-8 pb-16"
>
  <BackLink href={resolve("/library/album-artists")}>Album Artists</BackLink>

  {#if artistQuery.isError}
    <ErrorAlert
      message={LibraryErrors.commandMessage(artistQuery.error)}
      onRetry={() => void artistQuery.refetch()}
    />
  {:else if artistQuery.data === undefined || albums.isPending}
    <div class="mt-8">
      <PageTitle></PageTitle>
    </div>
    <LoadingStatus>Reading artist…</LoadingStatus>
  {:else if albums.isError}
    <ErrorAlert
      message={LibraryErrors.commandMessage(albums.error)}
      onRetry={() => void albums.refetch()}
    />
  {:else}
    {@const artist = artistQuery.data}
    {@const label = artistNameLabel(artist.name)}
    <MediaDetailsHeader title={label} artwork={artist.artwork} round>
      <div class="mt-2">
        <FactLine
          facts={[
            CountFormat.count(artist.albumCount, "album"),
            CountFormat.count(artist.trackCount, "track"),
          ]}
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
          itemKey={(album) => album.id}
          artworkAt={(index) => albums.items[index]?.artwork}
          sortSignature={view.sortSignature}
        >
          {#snippet tile(album)}
            <AlbumTile
              {album}
              showArtist={false}
              parentArtistId={artistId}
              onplay={(played) =>
                actions.run(() => playback.start({ kind: "album", albumId: played.id }, null))}
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
</WorkspaceScrollRegion>
