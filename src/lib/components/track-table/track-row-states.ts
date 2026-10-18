import type { TrackId } from "#lib/native";
import { Tracks } from "#lib/library/tracks";
import type { TrackTableRow } from "./track-columns";

export type TrackPlaybackStatus = "stopped" | "playing" | "paused" | "failed";

export interface TrackRowAction {
  label: string;
  kind: "play" | "pause" | "resume";
  /** Stays visible (not only on hover) because the track is the active one. */
  persistent: boolean;
}

export interface TrackRowState {
  action: TrackRowAction;
  /** What clicking the row itself does; nothing while unavailable or already playing. */
  clickIntent: "play" | "resume" | null;
  /** Set only for the active track while it is playing or paused. */
  playbackState: "playing" | "paused" | undefined;
}

/** What a track row offers for the playback status. */
export class TrackRowStates {
  /**
   * What a row offers, decided once from whether it is the active track and the playback status:
   * Pause/Resume for the active track, else Play.
   */
  public static of(
    row: Pick<TrackTableRow, "id" | "title" | "state">,
    activeTrackId: TrackId | null,
    status: TrackPlaybackStatus,
  ): TrackRowState {
    const playbackState =
      row.id === activeTrackId && (status === "playing" || status === "paused")
        ? status
        : undefined;
    const action: TrackRowAction =
      playbackState === "playing"
        ? { label: `Pause ${row.title}`, kind: "pause", persistent: true }
        : playbackState === "paused"
          ? { label: `Resume ${row.title}`, kind: "resume", persistent: true }
          : { label: `Play ${row.title}`, kind: "play", persistent: false };
    const clickIntent =
      !Tracks.isPlayable(row) || playbackState === "playing"
        ? null
        : playbackState === "paused"
          ? "resume"
          : "play";
    return { action, clickIntent, playbackState };
  }
}
