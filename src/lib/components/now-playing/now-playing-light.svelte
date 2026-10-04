<script lang="ts">
  import { getPlayback } from "$lib/playback/context";
  import { lightBreath } from "$lib/playback/light-breath";
  import { loudnessKeyframes } from "$lib/playback/loudness";
  import { createPlaybackWaveform } from "$lib/playback/waveform.svelte";
  import { getSettings } from "$lib/settings/context";
  import { getMotionBudget } from "$lib/shell/motion-budget.svelte";
  import ArtworkLight from "$lib/ui/artwork-light/artwork-light.svelte";
  import { breathingOpacity, LIGHT } from "$lib/ui/artwork-light/light-model";
  import { motionFor } from "$lib/ui/motion/svelte-motion";

  /**
   * Now Playing's Light, which breathes with the track's loudness (never brighter than its
   * strength). It follows the playback clock through compositor keyframes, so nothing re-renders with time. The
   * breathing is off under calm or reduced motion, and then nothing here runs per frame.
   */
  const playback = getPlayback();
  const settings = getSettings();
  const budget = getMotionBudget();

  /** The level a paused Light rests at: neither dimmed nor at full. */
  const REST_LEVEL = 0.5;

  const item = $derived(playback.item);
  // The Light breathes by itself, so only the full budget allows it.
  const breathing = $derived(budget.current === "full");
  const waveform = createPlaybackWaveform(() => playback.playbackId);

  const motion = $derived(motionFor("large"));
  // The Light breathes along the track's smoothed loudness, drawn by the compositor from
  // keyframes computed once per waveform; nothing here runs per frame.
  const breathe = $derived.by(() => {
    const loudness = loudnessKeyframes(waveform.current?.rms ?? null, playback.durationMs);
    if (!breathing || loudness.length === 0) return undefined;
    const opacityOf = (level: number) => breathingOpacity("max", level) / LIGHT.strength.max;
    return lightBreath({
      clock: playback.clock,
      keyframes: loudness.map(({ atMs, level }) => ({ atMs, opacity: opacityOf(level) })),
      restOpacity: opacityOf(REST_LEVEL),
      durationMs: motion.duration,
    });
  });
</script>

{#if settings.artworkBackdrop}
  <ArtworkLight
    artwork={item?.artwork ?? null}
    strength="max"
    enter={playback.lastNavigation === "previous" ? "wipe-previous" : "wipe-next"}
    {breathe}
  />
{/if}
