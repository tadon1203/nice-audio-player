import type { ArtworkRef } from "./bindings";

/** WebView2 serves the Tauri `nice-artwork` scheme from this HTTP origin on Windows. */
const ARTWORK_ORIGIN = "http://nice-artwork.localhost";

/**
 * `full` is the original image, for where the Sleeve is the star; `thumb` is its 512px JPEG,
 * for everything else. Until a thumbnail exists the app serves the original at the same URL.
 */
export type ArtworkLevel = "full" | "thumb";

export class ArtworkUrl {
  /** The `nice-artwork` URL of stored artwork at a level. */
  public static of(artwork: ArtworkRef | null | undefined, level: ArtworkLevel): string | null {
    if (!artwork) return null;
    const shard = artwork.hash.slice(0, 2);
    if (level === "thumb") return `${ARTWORK_ORIGIN}/artwork/${shard}/${artwork.hash}.thumb.jpg`;
    const extension = artwork.mimeType === "jpeg" ? "jpg" : "png";
    return `${ARTWORK_ORIGIN}/artwork/${shard}/${artwork.hash}.${extension}`;
  }
}
