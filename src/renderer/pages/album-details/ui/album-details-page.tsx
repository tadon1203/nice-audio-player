import { useMemo } from "react";
import { useElementScrollRestoration, useLocation, useParams } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useAlbumDetails, useAlbumTracks } from "@/renderer/entities/library";
import { usePlaybackActions, useTrackPlaybackState } from "@/renderer/features/playback-control";
import { formatCount, formatDuration } from "@/renderer/shared/lib/format";
import { BackLink } from "@/renderer/shared/ui/back-link";
import { SectionTitle } from "@/renderer/shared/ui/headings";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { EmptyStatus } from "@/renderer/shared/ui/workspace-status";
import { MediaDetailsHeader } from "@/renderer/widgets/media-details-header";
import {
  MediaDetailsLayout,
  useMediaDetailsWorkspace,
} from "@/renderer/widgets/media-details-layout";
import { TrackTable } from "@/renderer/widgets/track-table";

export function AlbumDetailsPage() {
  const { albumArtist, albumTitle } = useParams({
    from: "/library/albums/$albumArtist/$albumTitle",
  });
  const key = useMemo(() => ({ albumArtist, title: albumTitle }), [albumArtist, albumTitle]);
  const parentArtist = useLocation().state.parentArtist;
  const workspace = useMediaDetailsWorkspace(useAlbumDetails(key), useAlbumTracks(key));
  const playbackState = useTrackPlaybackState();
  const playback = usePlaybackActions();
  const scrollRestorationId = `album-${encodeURIComponent(albumArtist)}-${encodeURIComponent(albumTitle)}`;
  useElementScrollRestoration({ id: scrollRestorationId });

  return (
    <MediaDetailsLayout
      scrollRestorationId={scrollRestorationId}
      back={
        parentArtist ? (
          <BackLink to="/library/album-artists/$artistName" params={{ artistName: parentArtist }}>
            {parentArtist}
          </BackLink>
        ) : (
          <BackLink to="/library/albums">Albums</BackLink>
        )
      }
      loadingLabel="Reading album…"
      workspace={workspace}
    >
      {({ summary: details, items: tracks }) => (
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
            {tracks.length > 0 ? (
              <div className="mt-4">
                <TrackTable
                  rows={tracks}
                  layout="album"
                  caption="Album tracks"
                  activeTrackId={playbackState.activeTrackId}
                  playbackStatus={playbackState.playbackStatus}
                  onPlayTrack={playback.startLibraryTrack}
                  onPauseActive={playback.pause}
                  onResumeActive={playback.resume}
                />
              </div>
            ) : (
              <EmptyStatus>No tracks were indexed for this album.</EmptyStatus>
            )}
          </section>
        </>
      )}
    </MediaDetailsLayout>
  );
}
