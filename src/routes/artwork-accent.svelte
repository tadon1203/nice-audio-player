<script lang="ts">
  import { QueryResult } from "#lib/library/query-result.svelte";
  import { AppServices } from "#lib/shell/app-services.svelte";
  import { readableAccent } from "#lib/ui/artwork-glow/glow-model";

  /**
   * Publishes the playing track's color as `--artwork-accent` on the document. Only the played
   * part of the waveform, the interval line, the current lyric line and the playing marker in the
   * queue read it (see `app.css`, where it falls back to the foreground), so a single place
   * decides when the artwork's color shows up. The color is lightened to stay readable over the brightest Artwork glow.
   * Follows the `Artwork backdrop` preference: with the backdrop off there is no artwork color.
   */
  const { playback, appearance, catalog } = AppServices.current();
  const artworkColor = new QueryResult(() =>
    catalog.accentOptions(playback.item?.artwork?.hash ?? null),
  );
  const accent = $derived(
    appearance.artworkBackdrop ? readableAccent(artworkColor.data ?? null) : null,
  );

  $effect(() => {
    if (accent === null) return;
    const root = document.documentElement;
    root.style.setProperty("--artwork-accent", accent);
    return (): string => root.style.removeProperty("--artwork-accent");
  });
</script>
