import type { ArtworkRef } from "./bindings";

/** WebView2 serves the Tauri `nice-artwork` scheme from this HTTP origin on Windows. */
const ARTWORK_ORIGIN = "http://nice-artwork.localhost";
const ARTWORK_PATH = /^artwork\/([0-9a-f]{2})\/([0-9a-f]{64})\.(jpg|png)$/;

/**
 * `full` is the original image, for where the Sleeve is the star; `thumb` is its 512px JPEG,
 * for everything else. Until a thumbnail exists the app serves the original at the same URL.
 */
export type ArtworkLevel = "full" | "thumb";

/** Returns a URL only for canonical, content-addressed artwork identities. */
export function artworkUrl(
  artwork: ArtworkRef | null | undefined,
  level: ArtworkLevel,
): string | null {
  if (artwork === null || artwork === undefined || typeof artwork !== "object") return null;
  if (!/^[0-9a-f]{64}$/.test(artwork.contentHash)) return null;
  const match = ARTWORK_PATH.exec(artwork.relativePath);
  if (!match || match[1] !== artwork.contentHash.slice(0, 2)) return null;
  if (match[2] !== artwork.contentHash) return null;
  if (artwork.mimeType === "jpeg" && match[3] !== "jpg") return null;
  if (artwork.mimeType === "png" && match[3] !== "png") return null;
  if (level === "thumb") return `${ARTWORK_ORIGIN}/artwork/${match[1]}/${match[2]}.thumb.jpg`;
  return `${ARTWORK_ORIGIN}/${artwork.relativePath}`;
}
