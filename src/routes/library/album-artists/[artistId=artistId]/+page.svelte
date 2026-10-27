<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import MediaDetailsHeader from "#lib/components/media-details/media-details-header.svelte";
  import { createInfiniteQuery, createQuery } from "@tanstack/svelte-query";
  import { errorMessage } from "#lib/native/messages";
  import { loadedItems, pagesError, resultError, resultValue } from "#lib/library/query-pages";
  import { artistNameLabel } from "#lib/library/tracks";
  import { useApp } from "#lib/app/app.svelte";
  import { WorkspaceScroll } from "#lib/app/scroll.svelte";
  import BackLink from "#lib/components/ui/back-link.svelte";
  import CollectionSortControl from "#lib/components/ui/collection-sort-control.svelte";
  import ErrorAlert from "#lib/components/ui/error-alert.svelte";
  import FactLine from "#lib/components/ui/fact-line.svelte";
  import LoadMoreSentinel from "#lib/components/ui/load-more-sentinel.svelte";
  import VirtualMediaGrid from "#lib/components/ui/media-grid/virtual-media-grid.svelte";
  import PageTitle from "#lib/components/ui/page-title.svelte";
  import SectionTitle from "#lib/components/ui/section-title.svelte";
  import StatusRegion from "#lib/components/ui/status-region.svelte";
  import WorkspaceScrollRegion from "#lib/components/ui/workspace-scroll.svelte";
  import { CountFormat } from "#lib/utils/count-format";
  import AlbumTile from "../../album-tile.svelte";

  const {
    ui: { actions, scroll: scrollOffsets },
    library,
    player: playback,
  } = useApp();
  const view = library.artistAlbums;

  const artistId = $derived(page.params.artistId ?? "");

  const artistQuery = createQuery(() => library.getArtist(artistId));
  const artist = $derived(resultValue(artistQuery.data));
  const artistError = $derived(resultError(artistQuery.data));
  const albumsQuery = createInfiniteQuery(() =>
    library.getArtistAlbums({ artistId, sortKey: view.sortKey, direction: view.direction }),
  );
  const albums = $derived(loadedItems(albumsQuery.data));
  const albumsError = $derived(pagesError(albumsQuery.data));

  const scroll = new WorkspaceScroll(scrollOffsets, {
    resetKey: (): string => view.stateKey,
    ready: (): boolean => artist !== undefined && !albumsQuery.isPending && albums.length > 0,
  });

  export const snapshot = scrollOffsets.detailSnapshot(scroll.capture, scroll.restore);
</script>

<WorkspaceScrollRegion viewportAttachment={scroll.attach} contentClass="py-8 pb-16">
  <BackLink href={resolve("/library/album-artists")}>Album Artists</BackLink>

  {#if artistError !== null}
    <ErrorAlert
      message={errorMessage(artistError)}
      onRetry={() => actions.run(async () => (await artistQuery.refetch()).data, "library")}
    />
  {:else if artist === undefined || albumsQuery.isPending}
    <div class="mt-8">
      <PageTitle></PageTitle>
    </div>
    <StatusRegion loading>Reading artist…</StatusRegion>
  {:else if albumsError !== null}
    <ErrorAlert
      message={errorMessage(albumsError)}
      onRetry={() => actions.run(() => albumsQuery.refetch().then(() => undefined), "library")}
    />
  {:else}
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

      {#if albums.length > 0}
        <VirtualMediaGrid
          items={albums}
          itemKey={(album) => album.id}
          artworkAt={(index) => albums[index]?.artwork}
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
        {#if albumsQuery.hasNextPage}
          <LoadMoreSentinel
            pending={albumsQuery.isFetchingNextPage}
            onLoadMore={() =>
              actions.run(() => albumsQuery.fetchNextPage().then(() => undefined), "library")}
          />
        {/if}
      {:else}
        <StatusRegion>No albums were indexed for this artist.</StatusRegion>
      {/if}
    </section>
  {/if}
</WorkspaceScrollRegion>
