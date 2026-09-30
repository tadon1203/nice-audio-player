import { useEffect } from "react";
import { usePlaybackItem } from "@/renderer/entities/playback";
import { useArtworkAccent } from "@/renderer/entities/library";
import { useArtworkBackdrop } from "@/renderer/shared/lib/artwork-backdrop";
import { readableAccent } from "@/renderer/shared/ui/artwork-light";

/**
 * Publishes the playing track's color as `--artwork-accent` on the document. Only the played
 * part of the Now Playing waveform and the current lyric line read it (see `styles.css`, where it
 * falls back to the foreground), so a single place decides when the artwork's color shows up.
 * The color is lightened to stay readable over the brightest Light. Follows the `Artwork
 * backdrop` preference: with the backdrop off there is no artwork color anywhere.
 */
export function ArtworkAccent() {
  const item = usePlaybackItem();
  const enabled = useArtworkBackdrop((state) => state.enabled);
  const artworkColor = useArtworkAccent(item?.artwork);
  const accent = enabled ? readableAccent(artworkColor) : null;

  useEffect(() => {
    if (accent === null) return;
    const root = document.documentElement;
    root.style.setProperty("--artwork-accent", accent);
    return () => {
      root.style.removeProperty("--artwork-accent");
    };
  }, [accent]);

  return null;
}
