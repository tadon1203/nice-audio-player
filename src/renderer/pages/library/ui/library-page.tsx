import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { useElementScrollRestoration } from "@tanstack/react-router";
import type {
  LibraryAlbumArtistSummary,
  LibraryAlbumSummary,
  LibraryTrackSummary,
} from "@/renderer/entities/library";
import {
  AlbumTile,
  ArtistTile,
  albumArtistSortOptions,
  albumSortOptions,
  libraryCommandErrorMessage,
  libraryStatusMessage,
  useLibraryPresentationQuery,
  useLibraryStatus,
} from "@/renderer/entities/library";
import { usePlaybackActions, useTrackPlaybackState } from "@/renderer/features/playback-control";
import { formatCount } from "@/renderer/shared/lib/format";
import { MediaGrid } from "@/renderer/shared/ui/media-grid";
import { WorkspaceScroll } from "@/renderer/shared/ui/workspace-scroll";
import {
  EmptyStatus,
  ErrorAlert,
  LoadMoreButton,
  LoadingStatus,
} from "@/renderer/shared/ui/workspace-status";
import { TrackTable, type TrackTableRow } from "@/renderer/widgets/track-table";
import { useLibraryView, type LibraryPresentation } from "../model/use-library-view";
import { LibraryToolbar } from "./library-toolbar";

type LibraryViewState =
  | "loading"
  | "statusError"
  | "unavailable"
  | "catalogError"
  | "empty"
  | "content";

const presentationMeta = {
  albums: {
    title: "Albums",
    singular: "album",
    plural: "albums",
    searchLabel: "Search albums",
    searchPlaceholder: "Search albums…",
  },
  albumArtists: {
    title: "Album Artists",
    singular: "album artist",
    plural: "album artists",
    searchLabel: "Search album artists",
    searchPlaceholder: "Search album artists…",
  },
  tracks: {
    title: "Tracks",
    singular: "track",
    plural: "tracks",
    searchLabel: "Search tracks",
    searchPlaceholder: "Search tracks…",
  },
} as const;

export function LibraryPage({ presentation }: { presentation: LibraryPresentation }) {
  const meta = presentationMeta[presentation];
  const view = useLibraryView(presentation);
  const deferredFilter = useDeferredValue(view.filter);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previousViewStateRef = useRef<string | null>(null);
  const scrollRestorationId = `library-${presentation}`;
  const scrollEntry = useElementScrollRestoration({ id: scrollRestorationId });
  const statusQuery = useLibraryStatus();
  const statusMessage = statusQuery.data ? libraryStatusMessage(statusQuery.data) : null;
  const catalogEnabled = statusQuery.data?.status === "ready";
  const request = useMemo(
    () => ({ ...view.request, filter: deferredFilter }),
    [deferredFilter, view.request],
  );
  const query = useLibraryPresentationQuery(request, catalogEnabled);
  const playbackState = useTrackPlaybackState();
  const playback = usePlaybackActions();
  const trackRows = useMemo(
    () =>
      view.presentation === "tracks"
        ? (query.items as readonly LibraryTrackSummary[]).map(toTrackRow)
        : [],
    [view.presentation, query.items],
  );
  const count = query.totalCount;
  const countLabel = formatCount(count, meta.singular, meta.plural);
  const viewState: LibraryViewState = statusQuery.isError
    ? "statusError"
    : statusMessage !== null
      ? "unavailable"
      : statusQuery.isPending || query.isPending
        ? "loading"
        : query.isError
          ? "catalogError"
          : query.items.length === 0
            ? "empty"
            : "content";
  const catalogSettled =
    viewState === "content" || viewState === "empty" || viewState === "catalogError";
  const viewStateKey = `${view.presentation}\u0000${view.filter}\u0000${view.sortKey}\u0000${view.direction}`;

  useEffect(() => {
    if (previousViewStateRef.current === null) {
      previousViewStateRef.current = viewStateKey;
      return;
    }
    if (previousViewStateRef.current !== viewStateKey) {
      previousViewStateRef.current = viewStateKey;
      scrollContainerRef.current?.scrollTo({ top: 0 });
    }
  }, [viewStateKey]);

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <LibraryToolbar
        title={meta.title}
        countLabel={countLabel}
        searchLabel={meta.searchLabel}
        searchPlaceholder={meta.searchPlaceholder}
        filter={view.filter}
        updating={
          catalogSettled &&
          !query.isFetchingNextPage &&
          (query.isFetching || query.isPlaceholderData)
        }
        onFilterChange={(filter) => void view.setFilter(filter)}
        sort={
          view.presentation === "albums"
            ? {
                key: view.sortKey,
                direction: view.direction,
                options: albumSortOptions,
                onKeyChange: (key) => void view.setSort(key),
                onToggleDirection: () => void view.toggleDirection(),
              }
            : view.presentation === "albumArtists"
              ? {
                  key: view.sortKey,
                  direction: view.direction,
                  options: albumArtistSortOptions,
                  onKeyChange: (key) => void view.setSort(key),
                  onToggleDirection: () => void view.toggleDirection(),
                }
              : undefined
        }
      />

      <div className="min-h-0">
        <WorkspaceScroll
          scrollRestorationId={scrollRestorationId}
          viewportRef={scrollContainerRef}
          contentClassName="pt-6 pb-16"
        >
          {viewState === "loading" ? <LoadingStatus>Loading library…</LoadingStatus> : null}

          {viewState === "statusError" ? (
            <ErrorAlert
              message={libraryCommandErrorMessage(statusQuery.error)}
              onRetry={() => void statusQuery.refetch()}
            />
          ) : null}

          {viewState === "unavailable" ? <ErrorAlert message={statusMessage ?? ""} /> : null}

          {viewState === "catalogError" ? (
            <ErrorAlert
              message={libraryCommandErrorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          ) : null}

          {viewState === "empty" ? (
            <EmptyStatus>
              {view.filter === ""
                ? `No ${meta.plural} in your library.`
                : `No results for “${view.filter}”.`}
            </EmptyStatus>
          ) : null}

          {viewState === "content" ? (
            <>
              {view.presentation === "albums" ? (
                <AlbumGrid albums={query.items as readonly LibraryAlbumSummary[]} />
              ) : null}
              {view.presentation === "albumArtists" ? (
                <ArtistGrid artists={query.items as readonly LibraryAlbumArtistSummary[]} />
              ) : null}
              {view.presentation === "tracks" ? (
                <TrackTable
                  rows={trackRows}
                  layout="library"
                  caption="Library tracks"
                  scrollContainerRef={scrollContainerRef}
                  initialOffset={scrollEntry?.scrollY}
                  activeTrackId={playbackState.activeTrackId}
                  playbackStatus={playbackState.playbackStatus}
                  sortKey={view.sortKey}
                  sortDirection={view.direction}
                  onSortChange={(key, direction) => void view.setTrackSort(key, direction)}
                  onPlayTrack={(id) => void playback.startLibraryTrack(id)}
                  onPauseActive={() => void playback.pause()}
                  onResumeActive={() => void playback.resume()}
                />
              ) : null}
              {query.hasNextPage ? (
                <LoadMoreButton
                  pending={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                />
              ) : null}
            </>
          ) : null}
        </WorkspaceScroll>
      </div>
    </div>
  );
}

function AlbumGrid({ albums }: { albums: readonly LibraryAlbumSummary[] }) {
  return (
    <MediaGrid>
      {albums.map((album) => (
        <li key={`${album.key.albumArtist}\u0000${album.key.title}`}>
          <AlbumTile album={album} />
        </li>
      ))}
    </MediaGrid>
  );
}

function ArtistGrid({ artists }: { artists: readonly LibraryAlbumArtistSummary[] }) {
  return (
    <MediaGrid>
      {artists.map((artist) => (
        <li key={artist.key.name}>
          <ArtistTile artist={artist} />
        </li>
      ))}
    </MediaGrid>
  );
}

function toTrackRow(track: LibraryTrackSummary): TrackTableRow {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    availability: track.availability,
    playable: track.playable,
  };
}
