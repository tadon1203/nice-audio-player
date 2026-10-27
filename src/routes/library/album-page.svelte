<script lang="ts">
  import { type AlbumId, type ArtistId, type TrackId } from "#lib/native/bindings";
  import Shuffle from "@lucide/svelte/icons/shuffle";
  import { createInfiniteQuery, createQuery } from "@tanstack/svelte-query";
  import { resolve } from "$app/paths";
  import AlbumStrip from "#lib/components/media-details/album-strip.svelte";
  import MediaDetailsHeader from "#lib/components/media-details/media-details-header.svelte";
  import TrackTable from "#lib/components/track-table/track-table.svelte";
  import { errorMessage } from "#lib/native/messages";
  import { loadedItems, pagesError, resultError, resultValue } from "#lib/library/query-pages";
  import { albumTitleLabel, artistNameLabel } from "#lib/library/tracks";
  import { useApp } from "#lib/app/app.svelte";
  import { WorkspaceScroll } from "#lib/app/scroll.svelte";
  import BackLink from "#lib/components/ui/back-link.svelte";
  import ErrorAlert from "#lib/components/ui/error-alert.svelte";
  import FactLine from "#lib/components/ui/fact-line.svelte";
  import LoadMoreSentinel from "#lib/components/ui/load-more-sentinel.svelte";
  import PlayPauseIcon from "#lib/components/ui/play-pause-icon.svelte";
  import SectionTitle from "#lib/components/ui/section-title.svelte";
  import StatusRegion from "#lib/components/ui/status-region.svelte";
  import { Button } from "#lib/components/ui/shadcn/button/index.js";
  import WorkspaceScrollRegion from "#lib/components/ui/workspace-scroll.svelte";
  import { CountFormat } from "#lib/utils/count-format";
  import { DurationFormat } from "#lib/utils/duration-format";

  /**
   * One album page for both routes: the album by its ID, and the Album Artist it was opened from
   * (null when it was opened from the Albums list). The parent is in the URL, so Back returns
   * to it after a reload too.
   */
  let {
    albumId,
    parentArtistId,
  }: {
    readonly albumId: AlbumId;
    /** The Album Artist page this album was opened from; Back returns there. */
    readonly parentArtistId: ArtistId | null;
  } = $props();

  const {
    ui: { actions, scroll: scrollOffsets },
    library,
    player: playback,
  } = useApp();

  const detailsQuery = createQuery(() => library.getAlbum(albumId));
  const details = $derived(resultValue(detailsQuery.data));
  const detailsError = $derived(resultError(detailsQuery.data));
  const tracksQuery = createInfiniteQuery(() => library.getAlbumTracks(albumId));
  const tracks = $derived(loadedItems(tracksQuery.data));
  const tracksError = $derived(pagesError(tracksQuery.data));

  // The list cache usually holds the album already, so the header can show it before the details.
  const summary = $derived(details?.summary ?? library.getCachedAlbum(albumId));
  const title = $derived(summary === null ? "" : albumTitleLabel(summary.title));
  const artist = $derived(summary === null ? "" : artistNameLabel(summary.albumArtist.name));

  // The loaded track belongs to this album (the same ID the album was opened with).
  const albumIsLoaded = $derived(playback.isAlbumLoaded(albumId));
  const albumIsPlaying = $derived(albumIsLoaded && playback.isPlaying);

  // Playing a track continues through the rest of its album.
  const playTrack = (trackId: TrackId): void =>
    actions.run(() => playback.start({ kind: "album", albumId }, trackId));

  const scroll = new WorkspaceScroll(scrollOffsets, {
    ready: (): boolean => details !== undefined && !tracksQuery.isPending && tracks.length > 0,
  });

  export const snapshot = scrollOffsets.detailSnapshot(scroll.capture, scroll.restore);
</script>

<WorkspaceScrollRegion viewportAttachment={scroll.attach} contentClass="py-8 pb-16">
  {#if parentArtistId !== null}
    <BackLink
      href={resolve("/library/album-artists/[artistId=artistId]", { artistId: parentArtistId })}
      >{artist}</BackLink
    >
  {:else}
    <BackLink href={resolve("/library/albums")}>Albums</BackLink>
  {/if}

  {#if detailsError !== null}
    <ErrorAlert
      message={errorMessage(detailsError)}
      onRetry={() => actions.run(() => detailsQuery.refetch().then(() => undefined), "library")}
    />
  {:else if details === undefined || tracksQuery.isPending}
    <MediaDetailsHeader {title} {artist} artwork={summary?.artwork ?? null} sharedKey={albumId} />
    <StatusRegion loading>Reading album…</StatusRegion>
  {:else if tracksError !== null}
    <ErrorAlert
      message={errorMessage(tracksError)}
      onRetry={() => actions.run(() => tracksQuery.refetch().then(() => undefined), "library")}
    />
  {:else}
    {@const album = details}
    <MediaDetailsHeader {title} {artist} artwork={album.summary.artwork} sharedKey={albumId}>
      {#snippet strip()}
        {#if tracks.length > 0}
          <AlbumStrip {tracks} activeTrackId={playback.activeTrackId} onplaytrack={playTrack} />
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
      {#if tracks.length > 0}
        <div class="mt-4">
          <TrackTable rows={tracks} layout="album" caption="Album tracks" onplaytrack={playTrack} />
        </div>
      {:else}
        <StatusRegion>No tracks were indexed for this album.</StatusRegion>
      {/if}
    </section>
    {#if tracksQuery.hasNextPage}
      <LoadMoreSentinel
        pending={tracksQuery.isFetchingNextPage}
        onLoadMore={() =>
          actions.run(() => tracksQuery.fetchNextPage().then(() => undefined), "library")}
      />
    {/if}
  {/if}
</WorkspaceScrollRegion>
