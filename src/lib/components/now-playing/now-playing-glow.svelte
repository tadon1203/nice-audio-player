<script lang="ts">
  import { useApp } from "#lib/app/app.svelte";
  import { GlowBreath } from "#lib/player/glow-breath";
  import { Loudness } from "#lib/player/loudness";
  import ArtworkGlow from "#lib/ui/artwork-glow/artwork-glow.svelte";
  import { GLOW } from "#lib/ui/artwork-glow/glow";
  import { GlowOpacity } from "#lib/ui/artwork-glow/glow-opacity";
  import { SvelteMotion } from "#lib/ui/motion/svelte-motion";

  /**
   * Now Playing's Artwork glow, which breathes with the track's loudness (never brighter than its
   * strength). It follows the playback clock through compositor keyframes, so nothing re-renders with time. The
   * breathing is off under calm or reduced motion, and then nothing here runs per frame.
   */
  const playback = useApp().player;
  const appearance = useApp().appearance;
  const appMotion = useApp().motion;

  /** The level a paused Artwork glow rests at: neither dimmed nor at full. */
  const REST_LEVEL = 0.5;

  const item = $derived(playback.item);
  // The Artwork glow breathes by itself, so only full motion allows it.
  const breathing = $derived(appMotion.breathing);
  const waveform = $derived(playback.waveform);

  const motion = $derived(SvelteMotion.of("large"));
  // The Artwork glow breathes along the track's smoothed loudness, drawn by the compositor from
  // keyframes computed once per waveform; nothing here runs per frame.
  const breathe = $derived.by(() => {
    const loudness = Loudness.keyframes(waveform?.rms ?? null, playback.durationMs);
    if (!breathing || loudness.length === 0) return undefined;
    const opacityOf = (level: number): number =>
      GlowOpacity.breathing("max", level) / GLOW.strength.max;
    return GlowBreath.attach({
      clock: playback.clock,
      keyframes: loudness.map(({ atMs, level }) => ({ atMs, opacity: opacityOf(level) })),
      restOpacity: opacityOf(REST_LEVEL),
      durationMs: motion.duration,
    });
  });
</script>

{#if appearance.artworkBackdrop}
  <ArtworkGlow
    artwork={item?.artwork ?? null}
    strength="max"
    enter={playback.transitionDirection === "backward" ? "wipe-previous" : "wipe-next"}
    {breathe}
  />
{/if}
