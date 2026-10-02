<script lang="ts">
  import { watchClock } from "$lib/playback/clock";
  import { getPlayback } from "$lib/playback/context";
  import { createLoudnessLevel } from "$lib/playback/loudness-level";
  import { createPlaybackWaveform } from "$lib/playback/waveform.svelte";
  import { getSettings } from "$lib/settings/context";
  import { getMotionBudget } from "$lib/shell/motion-budget.svelte";
  import ArtworkLight from "$lib/ui/artwork-light/artwork-light.svelte";

  /**
   * Now Playing's Light, which breathes with the track's loudness (never brighter than its
   * strength). It follows the playback clock directly, so nothing re-renders with time. The
   * breathing is off under calm or reduced motion, and then nothing here runs per frame.
   */
  const playback = getPlayback();
  const settings = getSettings();
  const budget = getMotionBudget();

  const item = $derived(playback.item);
  // The Light breathes by itself, so only the full budget allows it.
  const breathing = $derived(budget.current === "full");
  const playing = $derived(playback.status === "playing");
  const waveform = createPlaybackWaveform(() => playback.playbackId);

  const loudness = createLoudnessLevel({
    clock: playback.clock,
    rms: null,
    durationMs: null,
    playing: false,
    enabled: false,
  });
  $effect(() => {
    loudness.update({
      rms: waveform.current?.rms ?? null,
      durationMs: playback.durationMs,
      playing,
      enabled: breathing,
    });
  });
  $effect(() => () => loudness.destroy());

  // The clock's frame loop runs only while someone follows it.
  $effect(() => {
    if (!breathing) return;
    return watchClock(playback.clock, () => {});
  });
</script>

{#if settings.artworkBackdrop}
  <ArtworkLight
    artwork={item?.artwork ?? null}
    strength="max"
    enter={playback.lastNavigation === "previous" ? "wipe-previous" : "wipe-next"}
    level={breathing ? loudness.level : undefined}
  />
{/if}
