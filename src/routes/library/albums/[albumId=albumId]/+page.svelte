<script lang="ts">
  import type { AlbumId, TrackId } from "#lib/native";
  import Shuffle from "@lucide/svelte/icons/shuffle";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import AlbumStrip from "#lib/components/media-details/album-strip.svelte";
  import MediaDetailsHeader from "#lib/components/media-details/media-details-header.svelte";
  import TrackTable from "#lib/components/track-table/track-table.svelte";
  import { LibraryErrors } from "#lib/library/library-errors";
  import { PagedCollection } from "#lib/library/paged-collection.svelte";
  import { QueryResult } from "#lib/library/query-result.svelte";
  import { albumFromArtist } from "#lib/library/routes";
  import { albumTitleLabel, artistNameLabel } from "#lib/library/unknown-name";
  import { AppServices } from "#lib/shell/app-services.svelte";
  import { WorkspaceScroll } from "#lib/shell/workspace-scroll.svelte";
  import BackLink from "#lib/ui/back-link.svelte";
  import EmptyStatus from "#lib/ui/empty-status.svelte";
  import ErrorAlert from "#lib/ui/error-alert.svelte";
  import FactLine from "#lib/ui/fact-line.svelte";
  import LoadMoreSentinel from "#lib/ui/load-more-sentinel.svelte";
  import LoadingStatus from "#lib/ui/loading-status.svelte";
  import PlayPauseIcon from "#lib/ui/play-pause-icon.svelte";
  import SectionTitle from "#lib/ui/section-title.svelte";
  import { Button } from "#lib/ui/shadcn/button/index.js";
  import WorkspaceScrollRegion from "#lib/ui/workspace-scroll.svelte";
  import { CountFormat } from "#lib/utils/count-format";
  import { DurationFormat } from "#lib/utils/duration-format";

  const { actions, albums, playback, scrollMemory } = AppServices.current();

  // The album's names are not in the URL, so they come with its details.
  const albumId = $derived(page.params.albumId as AlbumId);
  const fromArtist = $derived(albumFromArtist(page.url.searchParams));

  const details = new QueryResult(() => albums.detailsOptions(albumId));
  const tracks = new PagedCollection(() => albums.tracksOptions(albumId));

  const title = $derived(
    details.data === undefined ? "" : albumTitleLabel(details.data.summary.title),
  );
  const artist = $derived(
    details.data === undefined ? "" : artistNameLabel(details.data.summary.albumArtist.name),
  );

  // The loaded track belongs to this album (the same ID the album was opened with).
  const albumIsLoaded = $derived(playback.isAlbumLoaded(albumId));
  const albumIsPlaying = $derived(albumIsLoaded && playback.isPlaying);

  // Playing a track continues through the rest of its album.
  const playTrack = (trackId: TrackId) =>
    actions.run(() => playback.start({ kind: "album", albumId }, trackId));

  let viewport = $state<HTMLElement | null>(null);

  const scroll = new WorkspaceScroll(scrollMemory, {
    ready: () => details.data !== undefined && !tracks.isPending && tracks.items.length > 0,
  });

  export const snapshot = scrollMemory.detailSnapshot(scroll.capture, scroll.restore);
</script>

<WorkspaceScrollRegion
  bind:viewportRef={viewport}
  viewportAttachment={scroll.attach}
  contentClass="py-8 pb-16"
>
  {#if fromArtist}
    <!-- The artist's ID comes from the album's details, so the link needs no history state. -->
    <BackLink
      href={details.data === undefined
        ? resolve("/library/album-artists")
        : resolve("/library/album-artists/[artistId=artistId]", {
            artistId: details.data.summary.albumArtist.id,
          })}>{artist}</BackLink
    >
  {:else}
    <BackLink href={resolve("/library/albums")}>Albums</BackLink>
  {/if}

  {#if details.isError}
    <ErrorAlert
      message={LibraryErrors.commandMessage(details.error)}
      onRetry={() => void details.refetch()}
    />
  {:else if details.data === undefined || tracks.isPending}
    <!-- What the cached lists already tell, so the page is not empty. -->
    <MediaDetailsHeader
      {title}
      {artist}
      artwork={albums.cachedSummaryById(albumId)?.artwork ?? null}
      sharedKey={albumId}
    />
    <LoadingStatus>Reading album…</LoadingStatus>
  {:else if tracks.isError}
    <ErrorAlert
      message={LibraryErrors.commandMessage(tracks.error)}
      onRetry={() => void tracks.refetch()}
    />
  {:else}
    {@const album = details.data}
    <MediaDetailsHeader {title} {artist} artwork={album.summary.artwork} sharedKey={albumId}>
      {#snippet strip()}
        {#if tracks.items.length > 0}
          <AlbumStrip
            tracks={tracks.items}
            activeTrackId={playback.activeTrackId}
            onplaytrack={playTrack}
          />
        {/if}
      {/snippet}
      <FactLine
        facts={[
          album.date ?? album.summary.year,
          album.trackCount !== null
            ? { text: CountFormat.count(album.trackCount, "track"), countUp: true }
            : null,
          album.durationMs !== null
            ? { text: DurationFormat.of(album.durationMs), countUp: true }
            : null,
        ]}
        fallback="Album details unavailable"
      />
      <div class="mt-6 flex items-center gap-2">
        <Button
          type="button"
          disabled={album.firstPlayableTrackId === null}
          onclick={() => actions.run(() => playback.togglePlayAlbum(albumId))}
        >
          <PlayPauseIcon playing={albumIsPlaying} data-icon="inline-start" />
          {albumIsPlaying ? "Pause" : albumIsLoaded ? "Resume" : "Play album"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={album.firstPlayableTrackId === null}
          onclick={() => actions.run(() => playback.shuffleAndStart({ kind: "album", albumId }))}
        >
          <Shuffle data-icon="inline-start" aria-hidden="true" />
          Shuffle
        </Button>
      </div>
    </MediaDetailsHeader>

    <section class="mt-10" aria-labelledby="album-track-list-title">
      <SectionTitle id="album-track-list-title" class="sr-only">Tracks</SectionTitle>
      {#if tracks.items.length > 0}
        <div class="mt-4">
          <TrackTable
            rows={tracks.items}
            layout="album"
            caption="Album tracks"
            onplaytrack={playTrack}
          />
        </div>
      {:else}
        <EmptyStatus>No tracks were indexed for this album.</EmptyStatus>
      {/if}
    </section>
    {#if tracks.hasNextPage}
      <LoadMoreSentinel
        {viewport}
        pending={tracks.isFetchingNextPage}
        onLoadMore={() => void tracks.fetchNextPage()}
      />
    {/if}
  {/if}
</WorkspaceScrollRegion>
