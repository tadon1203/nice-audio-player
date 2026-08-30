import type { LibraryTrackSummary } from "@/bindings";
import { formatPlaybackTime } from "@/lib/playback-time";
import { LibraryArtwork } from "./LibraryArtwork";
import { PlayingMarker } from "@/components/ui/PlayingMarker";

export function TrackRow({
  track,
  playbackAvailable,
  onPlayTrack,
  active = false,
}: {
  track: LibraryTrackSummary;
  playbackAvailable: boolean;
  onPlayTrack: (id: string) => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`grid min-h-[84px] w-full grid-cols-[64px_minmax(0,1fr)_64px] items-center gap-4 border-0 border-b border-border-subtle bg-transparent px-0 py-2 text-start text-text-primary disabled:cursor-not-allowed disabled:text-text-disabled ${active ? "bg-surface-raised" : ""}`}
      disabled={!playbackAvailable || !track.playable}
      aria-current={active ? "true" : undefined}
      aria-label={`Play ${track.title} by ${track.artist ?? "Unknown artist"}`}
      onClick={() => onPlayTrack(track.id)}
    >
      <span className="relative block w-16">
        <LibraryArtwork artwork={track.artwork} />
        {active ? (
          <span className="absolute bottom-1.5 start-1.5 bg-canvas">
            <PlayingMarker />
          </span>
        ) : null}
      </span>
      <div className="min-w-0">
        <h3
          className="overflow-hidden text-ellipsis whitespace-nowrap text-body-md"
          title={track.title}
        >
          {track.title}
        </h3>
        <p
          className="overflow-hidden text-ellipsis whitespace-nowrap text-body-sm text-text-secondary"
          title={track.artist ?? undefined}
        >
          {track.artist ?? "Unknown artist"} · {track.album ?? "Unknown album"}
        </p>
      </div>
      <span className="text-end text-caption tabular-nums text-text-secondary">
        {track.durationMs === null ? "--:--" : formatPlaybackTime(track.durationMs)}
      </span>
    </button>
  );
}
