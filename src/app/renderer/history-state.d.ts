declare module "@tanstack/history" {
  interface HistoryState {
    parentArtist?: string;
    /** Now Playing is a layer over the current location, not a route of its own. */
    nowPlaying?: boolean;
  }
}
