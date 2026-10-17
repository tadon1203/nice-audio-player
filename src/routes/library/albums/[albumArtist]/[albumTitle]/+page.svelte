<script lang="ts">
  import type { TrackId } from "#lib/native";
  import Shuffle from "@lucide/svelte/icons/shuffle";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import AlbumStrip from "#lib/components/media-details/album-strip.svelte";
  import MediaDetailsHeader from "#lib/components/media-details/media-details-header.svelte";
  import TrackTable from "#lib/components/track-table/track-table.svelte";
  import { albumItemKey } from "#lib/library/album-key";
  import { LibraryErrors } from "#lib/library/library-errors";
  import { PagedCollection } from "#lib/library/paged-collection.svelte";
  import { QueryResult } from "#lib/library/query-result.svelte";
  import { albumArtistHref, albumEditionOf } from "#lib/library/routes";
  import { albumTitleLabel, artistNameLabel, fromNameSegment } from "#lib/library/unknown-name";
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

  const { actions, albums, history, playback, scrollMemory } = AppServices.current();

  const albumArtist = $derived(fromNameSegment(page.params.albumArtist ?? ""));
  const albumTitle = $derived(fromNameSegment(page.params.albumTitle ?? ""));
  const albumEdition = $derived(albumEditionOf(page.url.searchParams));
  const key = $derived({ albumArtist, title: albumTitle, albumEdition });
  const title = $derived(albumTitleLabel(albumTitle));
  const artist = $derived(artistNameLabel(albumArtist));
  const shared = $derived(albumItemKey(key));
  // Where the album was opened from, when that was an album artist's page.
  const parentArtist = $derived(history.albumOrigin.parentArtist);

  const details = new QueryResult(() => albums.detailsOptions(key));
  const tracks = new PagedCollection(() => albums.tracksOptions(key));

  // The loaded track belongs to this album (the same key the album was opened with).
  const albumIsLoaded = $derived(playback.isAlbumLoaded(key));
  const albumIsPlaying = $derived(albumIsLoaded && playback.isPlaying);

  // Playing a track continues through the rest of its album.
  const playTrack = (trackId: TrackId) =>
    actions.run(() => playback.start({ kind: "album", key }, trackId));

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
  {#if parentArtist !== undefined}
    <BackLink href={albumArtistHref(parentArtist)}>{artistNameLabel(parentArtist)}</BackLink>
  {:else}
    <BackLink href={resolve("/library/albums")}>Albums</BackLink>
  {/if}

  {#if details.isError}
    <ErrorAlert
      message={LibraryErrors.commandMessage(details.error)}
      onRetry={() => void details.refetch()}
    />
  {:else if details.data === undefined || tracks.isPending}
    <!-- What the route and its history state already tell, so the page is not empty. -->
    <MediaDetailsHeader
      {title}
      {artist}
      artwork={history.albumOrigin.artwork ?? null}
      sharedKey={shared}
    />
    <LoadingStatus>Reading album…</LoadingStatus>
  {:else if tracks.isError}
    <ErrorAlert
      message={LibraryErrors.commandMessage(tracks.error)}
      onRetry={() => void tracks.refetch()}
    />
  {:else}
    {@const album = details.data}
    <MediaDetailsHeader {title} {artist} artwork={album.summary.artwork} sharedKey={shared}>
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
          onclick={() => actions.run(() => playback.togglePlayAlbum(key))}
        >
          <PlayPauseIcon playing={albumIsPlaying} data-icon="inline-start" />
          {albumIsPlaying ? "Pause" : albumIsLoaded ? "Resume" : "Play album"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={album.firstPlayableTrackId === null}
          onclick={() => actions.run(() => playback.shuffleAndStart({ kind: "album", key }))}
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
