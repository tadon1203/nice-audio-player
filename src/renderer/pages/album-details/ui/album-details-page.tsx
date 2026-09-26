import { useMemo } from "react";
import { useElementScrollRestoration, useLocation } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useAlbumDetailsWorkspace } from "../model/use-album-details-workspace";
import { libraryCommandErrorMessage } from "@/renderer/entities/library";
import { usePlaybackActions, useTrackPlaybackState } from "@/renderer/features/playback-control";
import { formatCount, formatDuration } from "@/renderer/shared/lib/format";
import { BackLink } from "@/renderer/shared/ui/back-link";
import { SectionTitle } from "@/renderer/shared/ui/headings";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { WorkspaceScroll } from "@/renderer/shared/ui/workspace-scroll";
import {
  EmptyStatus,
  ErrorAlert,
  LoadMoreButton,
  LoadingStatus,
} from "@/renderer/shared/ui/workspace-status";
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
    <WorkspaceScroll scrollRestorationId={scrollRestorationId} contentClassName="py-8 pb-16">
      {parentArtist ? (
        <BackLink to="/library/album-artists/$artistName" params={{ artistName: parentArtist }}>
          {parentArtist}
        </BackLink>
      ) : (
        <BackLink to="/library/albums">Albums</BackLink>
      )}

      {workspace.loadState === "loading" ? (
        <LoadingStatus>Reading album…</LoadingStatus>
      ) : workspace.loadState === "error" || !details ? (
        <ErrorAlert
          message={libraryCommandErrorMessage(workspace.error)}
          onRetry={() => void workspace.reload()}
        />
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
              <Play aria-hidden="true" data-icon="inline-start" />
              Play album
            </Button>
          </MediaDetailsHeader>

          <section className="mt-10" aria-labelledby="album-track-list-title">
            <SectionTitle id="album-track-list-title">Tracks</SectionTitle>
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
              <EmptyStatus>No tracks were indexed for this album.</EmptyStatus>
            )}
          </section>

          {workspace.nextCursor ? (
            <LoadMoreButton
              pending={workspace.loadState === "loadingMore"}
              onClick={() => void workspace.loadMore()}
            />
          ) : null}
        </>
      )}
    </WorkspaceScroll>
  );
}
