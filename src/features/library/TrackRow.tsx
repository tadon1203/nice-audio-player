import type { LibraryTrackSummary } from "@/bindings";
import { formatPlaybackTime } from "@/lib/playback-time";
import { LibraryArtwork } from "./LibraryArtwork";

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
      className={`library-view__track${active ? " library-view__track--active" : ""}`}
      disabled={!playbackAvailable || !track.playable}
      aria-current={active ? "true" : undefined}
      aria-label={`Play ${track.title} by ${track.artist ?? "Unknown artist"}`}
      onClick={() => onPlayTrack(track.id)}
    >
      <LibraryArtwork artwork={track.artwork} />
      <div className="library-view__track-meta">
        <h3 title={track.title}>{track.title}</h3>
        <p title={track.artist ?? undefined}>
          {track.artist ?? "Unknown artist"} · {track.album ?? "Unknown album"}
        </p>
      </div>
      <span className="library-view__track-duration type-numeric">
        {track.durationMs === null ? "--:--" : formatPlaybackTime(track.durationMs)}
      </span>
    </button>
  );
}

