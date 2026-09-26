import { useMemo, useRef } from "react";
import { Link, useElementScrollRestoration, useLocation } from "@tanstack/react-router";
import { ArrowLeft, Play } from "lucide-react";
import { useAlbumDetailsWorkspace } from "../model/use-album-details-workspace";
import { libraryCommandErrorMessage } from "@/renderer/entities/library";
import { usePlaybackActions, useTrackPlaybackState } from "@/renderer/features/playback-control";
import { formatCount, formatDuration } from "@/renderer/shared/lib/format";
import { WorkspaceContainer } from "@/renderer/shared/layout/workspace-container";
import { Alert, AlertAction, AlertDescription } from "@/renderer/shared/ui/shadcn/alert";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { Empty, EmptyDescription } from "@/renderer/shared/ui/shadcn/empty";
import { Spinner } from "@/renderer/shared/ui/shadcn/spinner";
import { MediaDetailsHeader } from "@/renderer/widgets/media-details-header";
import { TrackTable, type TrackTableRow } from "@/renderer/widgets/track-table";

export function AlbumDetailsPage({
  albumArtist,
  albumTitle,
}: {
  albumArtist: string;
  albumTitle: string;
}) {
  const key = useMemo(() => ({ albumArtist, title: albumTitle }), [albumArtist, albumTitle]);
  const parentArtist = useLocation().state.parentArtist;
  const workspace = useAlbumDetailsWorkspace(key);
  const playbackState = useTrackPlaybackState();
  const playback = usePlaybackActions();
  const details = workspace.details;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollRestorationId = `album-${encodeURIComponent(albumArtist)}-${encodeURIComponent(albumTitle)}`;
  useElementScrollRestoration({ id: scrollRestorationId });
  const trackRows = useMemo<readonly TrackTableRow[]>(
    () =>
      workspace.tracks.map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        trackNumber: track.trackNumber,
        fileFormat: track.fileFormat,
        bitDepth: track.bitDepth,
        sampleRate: track.sampleRate,
        durationMs: track.durationMs,
        availability: track.availability,
        playable: track.playable,
      })),
    [workspace.tracks],
  );

  return (
    <div
      ref={scrollContainerRef}
      data-scroll-restoration-id={scrollRestorationId}
      className="h-full min-h-0 overflow-y-auto [scrollbar-gutter:stable]"
    >
      <WorkspaceContainer className="py-8 pb-16">
        {parentArtist ? (
          <Link
            to="/library/album-artists/$artistName"
            params={{ artistName: parentArtist }}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft aria-hidden="true" size={16} />
            {parentArtist}
          </Link>
        ) : (
          <Link
            to="/library/albums"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft aria-hidden="true" size={16} />
            Albums
          </Link>
        )}

        {workspace.loadState === "loading" ? (
          <div
            role="status"
            className="mt-8 flex items-center gap-2 py-8 text-sm text-muted-foreground"
          >
            <Spinner className="size-4" />
            Reading album…
          </div>
        ) : workspace.loadState === "error" || !details ? (
          <Alert variant="destructive" className="mt-8" role="alert">
            <AlertDescription>{libraryCommandErrorMessage(workspace.error)}</AlertDescription>
            <AlertAction>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void workspace.reload()}
              >
                Retry
              </Button>
            </AlertAction>
          </Alert>
        ) : (
          <>
            <MediaDetailsHeader
              kind="Album"
              title={albumTitle}
              artist={albumArtist}
              artwork={details.summary.artwork}
            >
              <p className="mt-4 text-sm tabular-nums text-muted-foreground">
                {[
                  details.date ?? details.summary.year,
                  details.trackCount !== null ? formatCount(details.trackCount, "track") : null,
                  details.durationMs !== null ? formatDuration(details.durationMs) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Album details unavailable"}
              </p>
              <Button
                type="button"
                className="mt-6"
                disabled={details.firstPlayableTrackId === null}
                onClick={() => void playback.startLibraryAlbum(key)}
              >
                <Play aria-hidden="true" className="size-4" />
                Play album
              </Button>
            </MediaDetailsHeader>

            <section className="mt-10" aria-labelledby="album-track-list-title">
              <h2 id="album-track-list-title" className="text-lg font-medium text-foreground">
                Tracks
              </h2>
              {trackRows.length > 0 ? (
                <div className="mt-4">
                  <TrackTable
                    rows={trackRows}
                    layout="album"
                    caption="Album tracks"
                    activeTrackId={playbackState.activeTrackId}
                    playbackStatus={playbackState.playbackStatus}
                    onPlayTrack={(id) => void playback.startLibraryTrack(id)}
                    onPauseActive={() => void playback.pause()}
                    onResumeActive={() => void playback.resume()}
                  />
                </div>
              ) : (
                <Empty className="mt-8" role="status">
                  <EmptyDescription>No tracks were indexed for this album.</EmptyDescription>
                </Empty>
              )}
            </section>

            {workspace.nextCursor ? (
              <div className="mt-7 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void workspace.loadMore()}
                  disabled={workspace.loadState === "loadingMore"}
                >
                  {workspace.loadState === "loadingMore" ? "Loading more…" : "Load more"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </WorkspaceContainer>
    </div>
  );
}
