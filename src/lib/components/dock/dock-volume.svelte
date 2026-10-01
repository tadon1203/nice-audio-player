<script lang="ts">
  import { List, Music2, Volume2, VolumeX } from "@lucide/svelte";
  import { getPlayback } from "$lib/playback/context";
  import {
    formatVolumeDb,
    sliderToVolume,
    stepVolumeDb,
    VOLUME_SLIDER_MAX,
    volumeToSlider,
  } from "$lib/playback/volume-step";
  import { nowPlaying } from "$lib/shell/now-playing.svelte";
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
  const output = $derived(playback.output);
  const ready = $derived(playback.transport.connection === "ready");
  const readout = $derived(formatVolumeDb(output.volume, output.muted));

  // Dragging the slider tracks the pointer 1:1; only the wheel and mute roll the readout.
  let dragging = $state(false);
  let readoutNode = $state<HTMLElement | null>(null);

  // Changing the volume while muted unmutes, so the change is audible.
  function setVolume(value: number) {
    playback.setVolume(value);
    if (output.muted && !output.mutePending) void playback.toggleMute();
  }

  function onWheel(event: WheelEvent) {
    if (!ready || event.deltaY === 0) return;
    // Pushing past either end of the range nudges the readout instead of doing nothing.
    const atCeiling = event.deltaY < 0 && output.volume >= 1 && !output.muted;
    const atFloor = event.deltaY > 0 && (output.volume <= 0 || output.muted);
    if (atCeiling || atFloor) {
      const dx = atCeiling ? 2 : -2;
      readoutNode?.animate(
        [
          { transform: "translateX(0)" },
          { transform: `translateX(${dx}px)` },
          { transform: "translateX(0)" },
        ],
        { duration: 120 },
      );
      return;
    }
    setVolume(stepVolumeDb(output.volume, event.deltaY < 0 ? 1 : -1));
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
    disabled={!playback.transport.active}
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
    aria-label={output.muted ? "Unmute" : "Mute"}
    disabled={output.mutePending || !ready}
    onclick={() => void playback.toggleMute()}
  >
    {#if output.muted}
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
      value={volumeToSlider(output.volume)}
      disabled={!ready}
      thumbProps={{
        "aria-label": "Volume",
        "aria-valuetext": output.muted ? "Muted" : formatVolumeDb(output.volume, false),
      }}
      onValueChange={(position) => setVolume(sliderToVolume(position))}
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
