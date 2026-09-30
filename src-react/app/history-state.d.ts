declare module "@tanstack/history" {
  interface HistoryState {
    parentArtist?: string;
    /** The artwork of the tile that was opened, so the details header can show it at once. */
    artwork?: import("@/shared/ipc").ArtworkRef | null;
    /** Now Playing is a layer over the current location, not a route of its own. */
    nowPlaying?: boolean;
  }
}
