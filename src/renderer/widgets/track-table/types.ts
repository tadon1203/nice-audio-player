import type { LibraryAlbumTrackSummary, LibraryTrackSummary } from "@/renderer/entities/library";

/** A track row shared by the Library and Album layouts; both DTOs satisfy it directly. */
export type TrackTableRow = Pick<
  LibraryTrackSummary,
  "id" | "title" | "artist" | "durationMs" | "availability" | "playable"
> &
  Partial<
    Pick<LibraryTrackSummary, "album"> &
      Pick<LibraryAlbumTrackSummary, "trackNumber" | "fileFormat" | "bitDepth" | "sampleRate">
  >;

export type TrackTableLayout = "library" | "album";

export type TrackPlaybackStatus = "stopped" | "playing" | "paused" | "failed";
