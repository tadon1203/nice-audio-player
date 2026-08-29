import type { LibraryAlbumKey } from "@/bindings";

export interface LibraryViewProps {
  onOpenSettings: () => void;
  onPlayTrack: (id: string) => void;
  onPlayAlbum: (key: LibraryAlbumKey) => void;
  onPlayAlbumTrack: (albumKey: LibraryAlbumKey, trackId: string) => void;
  activeTrackId: string | null;
  playbackStatus: "stopped" | "playing" | "paused" | "failed";
  playbackAvailable: boolean;
  libraryRefreshKey?: number;
  scanError?: string | null;
}

export type LibraryPresentation = "albums" | "albumArtists" | "tracks";
