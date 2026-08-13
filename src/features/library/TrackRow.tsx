import type { LibraryTrackSummary } from "@/bindings";
import { formatPlaybackTime } from "@/lib/playback-time";
import { LibraryArtwork } from "./LibraryArtwork";

export function TrackRow({
  track,
  playbackAvailable,
  onPlayTrack,
}: {
  track: LibraryTrackSummary;
  playbackAvailable: boolean;
  onPlayTrack: (id: string) => void;
}) {
  return (
    <article className="library-view__track">
      <LibraryArtwork artwork={track.artwork} />
      <div className="library-view__track-meta">
        <h3 title={track.title}>{track.title}</h3>
        <p title={track.artist ?? undefined}>{track.artist ?? "Unknown artist"}</p>
        <small title={track.album ?? undefined}>{track.album ?? "Unknown album"}</small>
        <small title={track.albumArtist ?? undefined}>
          {track.albumArtist ?? "Unknown artist"} ·{" "}
          {track.durationMs === null ? "--:--" : formatPlaybackTime(track.durationMs)}
        </small>
      </div>
      <button
        type="button"
        aria-label={`Play ${track.title}`}
        disabled={!playbackAvailable || !track.playable}
        onClick={() => onPlayTrack(track.id)}
      >
        Play
      </button>
    </article>
  );
}
