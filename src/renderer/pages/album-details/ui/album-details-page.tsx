import { useMemo } from "react";
import { FactLine } from "@/renderer/shared/ui/fact-line";
import { useElementScrollRestoration, useLocation, useParams } from "@tanstack/react-router";
import { PlayPauseIcon } from "@/renderer/shared/ui/play-pause-icon";
import {
  albumArtworkLayoutId,
  albumTitleLabel,
  artistNameLabel,
  fromNameSegment,
  toNameSegment,
  useAlbumDetails,
  useAlbumTracks,
} from "@/renderer/entities/library";
import { usePlaybackActions, useTrackPlaybackState } from "@/renderer/entities/playback";
import { formatCount, formatDuration } from "@/renderer/shared/lib/format";
import { BackLink } from "@/renderer/shared/ui/back-link";
import { SectionTitle } from "@/renderer/shared/ui/headings";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { EmptyStatus } from "@/renderer/shared/ui/workspace-status";
import { AlbumStrip, MediaDetailsHeader } from "@/renderer/widgets/media-details-header";
import {
  MediaDetailsLayout,
  useMediaDetailsWorkspace,
} from "@/renderer/widgets/media-details-layout";
import { TrackTable } from "@/renderer/widgets/track-table";

export function AlbumDetailsPage() {
  const params = useParams({ from: "/library/albums/$albumArtist/$albumTitle" });
  const albumArtist = fromNameSegment(params.albumArtist);
  const albumTitle = fromNameSegment(params.albumTitle);
  const key = useMemo(() => ({ albumArtist, title: albumTitle }), [albumArtist, albumTitle]);
  const { parentArtist, artwork: openedArtwork } = useLocation().state;
  const artworkLayoutId = albumArtworkLayoutId(key);
  const workspace = useMediaDetailsWorkspace(useAlbumDetails(key), useAlbumTracks(key));
  const playbackState = useTrackPlaybackState();
  const playback = usePlaybackActions();
  // Playing a track continues through the rest of its album.
  const playTrack = (trackId: string) =>
    void playback.startPlayback({ kind: "album", key }, trackId);
  const scrollRestorationId = `album-${encodeURIComponent(albumArtist)}-${encodeURIComponent(albumTitle)}`;
  useElementScrollRestoration({ id: scrollRestorationId });

  return (
    <MediaDetailsLayout
      scrollRestorationId={scrollRestorationId}
      back={
        parentArtist !== undefined ? (
          <BackLink
            to="/library/album-artists/$artistName"
            params={{ artistName: toNameSegment(parentArtist) }}
          >
            {artistNameLabel(parentArtist)}
          </BackLink>
        ) : (
          <BackLink to="/library/albums">Albums</BackLink>
        )
      }
      loadingLabel="Reading album…"
      loadingHeader={
        <MediaDetailsHeader
          title={albumTitleLabel(albumTitle)}
          artist={artistNameLabel(albumArtist)}
          artwork={openedArtwork ?? null}
          artworkLayoutId={artworkLayoutId}
        />
      }
      workspace={workspace}
    >
      {({ summary: details, items: tracks }) => (
        <>
          <MediaDetailsHeader
            title={albumTitleLabel(albumTitle)}
            artist={artistNameLabel(albumArtist)}
            artwork={details.summary.artwork}
            artworkLayoutId={artworkLayoutId}
            strip={
              tracks.length > 0 ? (
                <AlbumStrip
                  tracks={tracks}
                  activeTrackId={playbackState.activeTrackId}
                  onPlayTrack={playTrack}
                />
              ) : null
            }
          >
            <FactLine
              facts={[
                details.date ?? details.summary.year,
                details.trackCount !== null ? formatCount(details.trackCount, "track") : null,
                details.durationMs !== null ? formatDuration(details.durationMs) : null,
              ]}
              fallback="Album details unavailable"
            />
            <Button
              type="button"
              className="mt-6"
              disabled={details.firstPlayableTrackId === null}
              onClick={() => void playback.startPlayback({ kind: "album", key }, null)}
            >
              <PlayPauseIcon playing={false} data-icon="inline-start" />
              Play album
            </Button>
          </MediaDetailsHeader>

          <section className="mt-10" aria-labelledby="album-track-list-title">
            <SectionTitle id="album-track-list-title" className="sr-only">
              Tracks
            </SectionTitle>
            {tracks.length > 0 ? (
              <div className="mt-4">
                <TrackTable
                  rows={tracks}
                  layout="album"
                  caption="Album tracks"
                  activeTrackId={playbackState.activeTrackId}
                  playbackStatus={playbackState.playbackStatus}
                  onPlayTrack={playTrack}
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
