import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { useElementScrollRestoration } from "@tanstack/react-router";
import type {
  LibraryAlbumArtistSummary,
  LibraryAlbumSummary,
  LibraryTrackSummary,
} from "@/renderer/entities/library";
import {
  libraryCommandErrorMessage,
  libraryStatusMessage,
  useLibraryPresentationQuery,
  useLibraryStatus,
} from "@/renderer/entities/library";
import { usePlaybackActions, useTrackPlaybackState } from "@/renderer/features/playback-control";
import { Alert, AlertAction, AlertDescription } from "@/renderer/shared/ui/shadcn/alert";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { Empty, EmptyDescription } from "@/renderer/shared/ui/shadcn/empty";
import { Spinner } from "@/renderer/shared/ui/shadcn/spinner";
import { WorkspaceContainer } from "@/renderer/shared/layout/workspace-container";
import { MediaGrid } from "@/renderer/widgets/media-grid";
import { TrackTable, type TrackTableRow } from "@/renderer/widgets/track-table";
import { useLibraryView, type LibraryPresentation } from "../model/use-library-view";
import { AlbumCard } from "./album-card";
import { ArtistCard } from "./artist-card";
import { LibraryToolbar } from "./library-toolbar";

const presentationMeta = {
  albums: {
    title: "Albums",
    singular: "album",
    plural: "albums",
    searchLabel: "Search albums",
    searchPlaceholder: "Search albums…",
    sortOptions: [
      { key: "title", label: "Album title" },
      { key: "artist", label: "Album artist" },
      { key: "year", label: "Year" },
    ],
  },
  albumArtists: {
    title: "Album Artists",
    singular: "album artist",
    plural: "album artists",
    searchLabel: "Search album artists",
    searchPlaceholder: "Search album artists…",
    sortOptions: [
      { key: "artist", label: "Artist" },
      { key: "albumCount", label: "Album count" },
      { key: "trackCount", label: "Track count" },
    ],
  },
  tracks: {
    title: "Tracks",
    singular: "track",
    plural: "tracks",
    searchLabel: "Search tracks",
    searchPlaceholder: "Search tracks…",
    sortOptions: [],
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
  const countLabel = `${count === null ? "—" : count.toLocaleString()} ${
    count === 1 ? meta.singular : meta.plural
  }`;
  const initialLoading = statusQuery.isPending || (catalogEnabled && query.isPending);
  const catalogVisible = catalogEnabled && !statusQuery.isError && statusMessage === null;
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
          catalogVisible &&
          !query.isPending &&
          !query.isFetchingNextPage &&
          (query.isFetching || query.isPlaceholderData)
        }
        onFilterChange={(filter) => void view.setFilter(filter)}
        sort={
          view.presentation === "tracks"
            ? undefined
            : {
                key: view.sortKey,
                direction: view.direction,
                options: meta.sortOptions,
                onKeyChange: (key) => void view.setSort(key),
                onToggleDirection: () => void view.toggleDirection(),
              }
        }
      />

      <div className="min-h-0">
        <WorkspaceContainer className="h-full min-h-0 min-w-0">
          <div
            ref={scrollContainerRef}
            data-scroll-restoration-id={scrollRestorationId}
            className="h-full min-h-0 min-w-0 overflow-y-auto [scrollbar-gutter:stable]"
          >
            <div className="pt-6 pb-16">
              {initialLoading ? (
                <div
                  role="status"
                  className="flex items-center gap-2 py-8 text-sm text-muted-foreground"
                >
                  <Spinner className="size-4" />
                  Loading library…
                </div>
              ) : null}

              {statusQuery.isError ? (
                <Alert variant="destructive" className="my-4" role="alert">
                  <AlertDescription>
                    {libraryCommandErrorMessage(statusQuery.error)}
                  </AlertDescription>
                  <AlertAction>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void statusQuery.refetch()}
                    >
                      Retry
                    </Button>
                  </AlertAction>
                </Alert>
              ) : null}

              {!statusQuery.isError && statusMessage ? (
                <Alert variant="destructive" className="my-4" role="alert">
                  <AlertDescription>{statusMessage}</AlertDescription>
                </Alert>
              ) : null}

              {catalogVisible && query.isError ? (
                <Alert variant="destructive" className="my-4" role="alert">
                  <AlertDescription>{libraryCommandErrorMessage(query.error)}</AlertDescription>
                  <AlertAction>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void query.refetch()}
                    >
                      Retry
                    </Button>
                  </AlertAction>
                </Alert>
              ) : null}

              {catalogVisible && !query.isPending && !query.isError && query.items.length === 0 ? (
                <Empty className="my-4" role="status">
                  <EmptyDescription>
                    {view.filter === ""
                      ? `No ${meta.plural} in your library.`
                      : `No results for “${view.filter}”.`}
                  </EmptyDescription>
                </Empty>
              ) : null}

              {catalogVisible && !query.isPending && !query.isError && query.items.length > 0 ? (
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
                    <div className="flex justify-center py-8">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={query.isFetchingNextPage}
                        onClick={() => void query.fetchNextPage()}
                      >
                        {query.isFetchingNextPage ? "Loading…" : "Load more"}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </WorkspaceContainer>
      </div>
    </div>
  );
}

function AlbumGrid({ albums }: { albums: readonly LibraryAlbumSummary[] }) {
  return (
    <MediaGrid>
      {albums.map((album) => (
        <AlbumCard key={`${album.key.albumArtist}\u0000${album.key.title}`} album={album} />
      ))}
    </MediaGrid>
  );
}

function ArtistGrid({ artists }: { artists: readonly LibraryAlbumArtistSummary[] }) {
  return (
    <MediaGrid>
      {artists.map((artist) => (
        <ArtistCard key={artist.key.name} artist={artist} />
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
