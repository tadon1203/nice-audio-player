<script lang="ts">
  import { createArtworkAccent } from "$lib/library/detail.svelte";
  import { getPlayback } from "$lib/playback/context";
  import { getSettings } from "$lib/settings/context";
  import { readableAccent } from "$lib/ui/artwork-light/artwork-accent";

  /**
   * Publishes the playing track's color as `--artwork-accent` on the document. Only the played
   * part of the Now Playing waveform, the dock's progress ring and the current lyric line read it
   * (see `app.css`, where it falls back to the foreground), so a single place decides when the
   * artwork's color shows up. The color is lightened to stay readable over the brightest Light.
   * Follows the `Artwork backdrop` preference: with the backdrop off there is no artwork color.
   */
  const playback = getPlayback();
  const settings = getSettings();
  const artworkColor = createArtworkAccent(() => playback.item?.artwork);
  const accent = $derived(settings.artworkBackdrop ? readableAccent(artworkColor.current) : null);

  $effect(() => {
    if (accent === null) return;
    const root = document.documentElement;
    root.style.setProperty("--artwork-accent", accent);
    return () => root.style.removeProperty("--artwork-accent");
  });
</script>
