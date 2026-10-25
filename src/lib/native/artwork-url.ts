import type { ArtworkRef } from "./bindings";

/** WebView2 serves the Tauri `nice-artwork` scheme from this HTTP origin on Windows. */
const ARTWORK_ORIGIN = "http://nice-artwork.localhost";

/**
 * `full` is the original image, for where the Sleeve is the star; `thumb` is its 512px JPEG,
 * for everything else. The Backend gives the thumbnail's path, which is the original's when no
 * thumbnail could be made.
 */
export type ArtworkLevel = "full" | "thumb";

export class ArtworkUrl {
  /** The `nice-artwork` URL of stored artwork at a level. */
  public static of(artwork: ArtworkRef | null | undefined, level: ArtworkLevel): string | null {
    if (!artwork) return null;
    return `${ARTWORK_ORIGIN}/${level === "thumb" ? artwork.thumbPath : artwork.path}`;
  }
}
