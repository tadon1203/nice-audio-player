<script lang="ts">
  import List from "@lucide/svelte/icons/list";
  import Music2 from "@lucide/svelte/icons/music-2";
  import Volume2 from "@lucide/svelte/icons/volume-2";
  import VolumeX from "@lucide/svelte/icons/volume-x";
  import { getPlayback } from "$lib/playback/context";
  import {
    formatVolumeDb,
    sliderToVolume,
    stepVolumeDb,
    VOLUME_SLIDER_MAX,
    volumeToSlider,
  } from "$lib/playback/volume-step";
  import { nowPlaying } from "$lib/shell/now-playing.svelte";
  import { getMotionBudget } from "$lib/shell/motion-budget.svelte";
  import { springLinear } from "$lib/ui/motion/spring-curve";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import { queuePanel } from "$lib/shell/queue-panel.svelte";
  import RollingNumber from "$lib/ui/rolling-number/rolling-number.svelte";
  import { Button } from "$lib/ui/shadcn/button";
  import { Slider } from "$lib/ui/shadcn/slider";
  import DockSignalPath from "./dock-signal-path.svelte";
  import NextTrackPreview from "./next-track-preview.svelte";

  /**
   * Now Playing and queue toggles, mute, the volume slider (also driven by the wheel) and its
   * readout. The signal path hangs below this row, out of flow, so it never pulls the row off the
   * transport's centre line.
   */
  const playback = getPlayback();
  const budget = getMotionBudget();
  const ready = $derived(playback.connection === "ready");
  const readout = $derived(formatVolumeDb(playback.volume, playback.muted));

  // Dragging the slider tracks the pointer 1:1; only the wheel and mute roll the readout.
  let dragging = $state(false);
  let readoutNode = $state<HTMLElement | null>(null);

  function onWheel(event: WheelEvent) {
    if (!ready || event.deltaY === 0) return;
    // Pushing past either end of the range nudges the readout instead of doing nothing.
    const atCeiling = event.deltaY < 0 && playback.volume >= 1 && !playback.muted;
    const atFloor = event.deltaY > 0 && (playback.volume <= 0 || playback.muted);
    if (atCeiling || atFloor) {
      // Under reduced motion there is nothing to nudge; the readout already says it is at its end.
      if (budget.current === "reduced") return;
      const dx = atCeiling ? 2 : -2;
      readoutNode?.animate(
        [
          { transform: "translateX(0)" },
          { transform: `translateX(${dx}px)` },
          { transform: "translateX(0)" },
        ],
        { duration: motionFor("feedback").duration, easing: springLinear },
      );
      return;
    }
    playback.changeVolume(stepVolumeDb(playback.volume, event.deltaY < 0 ? 1 : -1));
  }
</script>

<svelte:window onpointerup={() => (dragging = false)} onpointercancel={() => (dragging = false)} />

<div
  class="relative col-start-3 flex min-w-0 items-center justify-self-end gap-1.5"
  data-region="volume"
>
  <!-- Out of flow, in the gap before the group, so it never moves anything. -->
  <NextTrackPreview class="absolute top-1/2 right-full mr-4 -translate-y-1/2 max-lg:hidden" />
  <Button
    size="icon-lg"
    variant="ghost"
    aria-label="Now Playing"
    title="Now Playing"
    aria-pressed={nowPlaying.isOpen}
    disabled={!playback.active}
    onclick={() => nowPlaying.toggle()}
    class="max-md:hidden"
  >
    <Music2 aria-hidden="true" />
  </Button>
  <Button
    size="icon-lg"
    variant="ghost"
    aria-label="Queue"
    title="Queue"
    aria-pressed={queuePanel.isOpen}
    onclick={() => queuePanel.toggle()}
    class="max-md:hidden"
  >
    <List aria-hidden="true" />
  </Button>
  <Button
    size="icon-lg"
    variant="ghost"
    aria-label={playback.muted ? "Unmute" : "Mute"}
    disabled={playback.mutePending || !ready}
    onclick={() => void playback.toggleMute()}
  >
    {#if playback.muted}
      <VolumeX aria-hidden="true" />
    {:else}
      <Volume2 aria-hidden="true" />
    {/if}
  </Button>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="w-24 shrink-0 sm:w-28"
    data-region="volume-slider"
    onpointerdown={() => (dragging = true)}
    onwheel={onWheel}
  >
    <Slider
      type="single"
      class="w-full"
      min={0}
      max={VOLUME_SLIDER_MAX}
      step={1}
      value={volumeToSlider(playback.volume)}
      disabled={!ready}
      thumbProps={{
        "aria-label": "Volume",
        "aria-valuetext": playback.muted ? "Muted" : formatVolumeDb(playback.volume, false),
      }}
      onValueChange={(position) => playback.changeVolume(sliderToVolume(position))}
    />
  </div>
  <span
    class="hidden min-w-16 shrink-0 text-right text-sm text-muted-foreground tabular-nums lg:inline"
    data-region="volume-readout"
  >
    <span bind:this={readoutNode} class="inline-block">
      {#if dragging}
        {readout}
      {:else}
        <RollingNumber value={readout} />
      {/if}
    </span>
  </span>
  <DockSignalPath class="absolute top-full right-0 mt-0.5 max-md:hidden" />
</div>
