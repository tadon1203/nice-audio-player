import { useMemo } from "react";
import { useElementScrollRestoration, useLocation, useParams } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useAlbumDetails, useAlbumTracks } from "@/renderer/entities/library";
import { usePlaybackActions, useTrackPlaybackState } from "@/renderer/features/playback-control";
import { formatCount, formatDuration } from "@/renderer/shared/lib/format";
import { cn } from "@/renderer/shared/lib/utils";
import { BackLink } from "@/renderer/shared/ui/back-link";
import { SectionTitle } from "@/renderer/shared/ui/headings";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/renderer/shared/ui/shadcn/tooltip";
import { EmptyStatus } from "@/renderer/shared/ui/workspace-status";
import { MediaDetailsHeader } from "@/renderer/widgets/media-details-header";
import {
  MediaDetailsLayout,
  useMediaDetailsWorkspace,
} from "@/renderer/widgets/media-details-layout";
import { TrackTable } from "@/renderer/widgets/track-table";
import type { TrackTableRow } from "@/renderer/widgets/track-table";

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
            strip={
              tracks.length > 0 ? (
                <AlbumTrackStrip
                  tracks={tracks}
                  activeTrackId={playbackState.activeTrackId}
                  onPlayTrack={playback.startLibraryTrack}
                />
              ) : null
            }
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

/** Segments proportional to each track's length; the playing track's segment is brighter. */
function AlbumTrackStrip({
  tracks,
  activeTrackId,
  onPlayTrack,
}: {
  tracks: TrackTableRow[];
  activeTrackId: string | null;
  onPlayTrack: (id: string) => void;
}) {
  const totalMs = tracks.reduce((sum, track) => sum + (track.durationMs ?? 0), 0);
  if (totalMs <= 0) return null;

  return (
    <div
      className="flex h-1.5 w-full gap-px overflow-hidden rounded-full"
      role="group"
      aria-label="Track lengths"
    >
      {tracks.map((track) => {
        const active = track.id === activeTrackId;
        const playable = track.playable && track.availability === "available";
        return (
          <Tooltip key={track.id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={track.title}
                  disabled={!playable}
                  onClick={() => onPlayTrack(track.id)}
                  className={cn(
                    "h-full min-w-0.5 cursor-pointer outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                    active ? "bg-foreground" : "bg-muted-foreground/50 hover:bg-muted-foreground",
                  )}
                  style={{ flexGrow: track.durationMs ?? 0 }}
                />
              }
            />
            <TooltipContent>{track.title}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
