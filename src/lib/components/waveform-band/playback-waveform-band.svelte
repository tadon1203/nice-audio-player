<script lang="ts" module>
  /** The dock's slim progress line: no waveform data, just position. */
  export const DOCK_SEEK_HEIGHT = 6;
</script>

<script lang="ts">
  import { Button } from "$lib/ui/shadcn/button";
  import { onDestroy, onMount, tick } from "svelte";
  import { getPlayback } from "$lib/playback/context";
  import { createPlaybackWaveform } from "$lib/playback/waveform.svelte";
  import { getMotionBudget } from "$lib/shell/motion-budget.svelte";
  import { lyricsWaveformLink } from "$lib/shell/lyrics-waveform-link.svelte";
  import RollingNumber from "$lib/ui/rolling-number/rolling-number.svelte";
  import { spinTurns } from "$lib/ui/rolling-number/rolling-model";
  import WaveformSeek from "$lib/ui/waveform/waveform-seek.svelte";
  import { cn } from "$lib/utils/cn.js";
  import { formatDuration } from "$lib/utils/format";

  /**
   * The seek bar and its elapsed/remaining labels in one line, used by both the dock (a plain
   * progress line, `showWaveform={false}`) and Now Playing (the waveform hero, `showWaveform`
   * defaulted true).
   * They are two separate bars, never morphed into each other: Now Playing's bars grow out of
   * its baseline once the waveform arrives. Only one is mounted at a time, since the dock hides
   * its band while Now Playing is open.
   */
  let {
    height,
    showWaveform = true,
    class: className,
    timeClass,
  }: {
    height: number;
    showWaveform?: boolean;
    class?: string;
    timeClass?: string;
  } = $props();

  const playback = getPlayback();
  const budget = getMotionBudget();
  const itemPath = $derived(playback.item?.file.path ?? "none");
  const canSeek = $derived(playback.active && playback.durationMs !== null);
  const waveform = createPlaybackWaveform(() => (showWaveform ? playback.playbackId : null));

  // The printed time and the announced value come from the same clock as the bar. They are
  // rounded down to the whole second, so they change once a second instead of every frame.
  let clockMs = $state(Math.floor(playback.clock.estimate() / 1000) * 1000);
  $effect(() =>
    // Not the eased position: after a seek the digits go to the new time at once, and spin.
    playback.clock.onBoundary(
      (positionMs) => Math.floor(positionMs / 1000 + 1) * 1000,
      (positionMs) => (clockMs = Math.floor(positionMs / 1000) * 1000),
    ),
  );

  let seekPreviewMs = $state<number | null>(null);
  // While dragging, the clock holds the bar at the preview position instead of playing on.
  let releaseHold: (() => void) | null = null;
  const holdAt = (ms: number) => {
    const next = playback.clock.hold(ms);
    releaseHold?.();
    releaseHold = next;
  };
  const letGo = () => {
    releaseHold?.();
    releaseHold = null;
  };
  onDestroy(letGo);
  let showRemaining = $state(true);
  const seekValue = $derived(seekPreviewMs ?? clockMs);
  const dragging = $derived(seekPreviewMs !== null);

  // A seek that just completed spins the time digits with its distance. Ordinary ticks, a new
  // track and dragging (the digits follow the pointer) do not.
  let spin = $state(0);
  onMount(() =>
    playback.clock.onJump((jump) => {
      if (jump.kind !== "seek" || dragging) return;
      spin = spinTurns(jump.toMs - jump.fromMs);
      void tick().then(() => (spin = 0));
    }),
  );

  const remainingOrLength = $derived(
    playback.durationMs === null
      ? formatDuration(null)
      : showRemaining
        ? `−${formatDuration(Math.max(0, playback.durationMs - seekValue))}`
        : formatDuration(playback.durationMs),
  );
</script>

{#snippet rolling(text: string)}
  <!-- Dragging tracks the pointer 1:1. Otherwise the digits roll only for a jump (a seek); the
  ordinary tick of a second is a plain rewrite, so the time does not add a second thing that
  moves all the time. A new track does not spin back. -->
  {#if dragging}
    {text}
  {:else}
    {#key itemPath}
      <RollingNumber value={text} {spin} instant={spin === 0} />
    {/key}
  {/if}
{/snippet}

{#snippet seekBar()}
  {#key itemPath}
    <WaveformSeek
      {height}
      rms={showWaveform ? (waveform.current?.rms ?? null) : null}
      showPlayhead={showWaveform}
      valueMs={seekValue}
      durationMs={playback.durationMs}
      drive={playback.clock.drive}
      sweepBars={showWaveform}
      stillBars={budget.current !== "full"}
      lineOnly={!showWaveform}
      disabled={!canSeek}
      onInput={(value) => {
        seekPreviewMs = value;
        holdAt(value);
      }}
      onCancel={() => {
        letGo();
        seekPreviewMs = null;
      }}
      onCommit={(value) => {
        // Holds the committed position until the seek is reported, so the bar never falls back.
        holdAt(value);
        void playback.seek(value).finally(() => {
          letGo();
          seekPreviewMs = null;
        });
      }}
      activeSpan={lyricsWaveformLink.activeSpan}
      hoveredLineSpan={lyricsWaveformLink.hoveredLineSpan}
      onHoverPositionChange={(ms) => lyricsWaveformLink.setHoveredWaveformMs(ms)}
      class="flex-1"
    />
  {/key}
{/snippet}

{#snippet remainingButton()}
  <Button
    type="button"
    aria-pressed={showRemaining}
    aria-label={showRemaining ? "Time remaining" : "Track length"}
    title={showRemaining ? "Show track length" : "Show time remaining"}
    variant="bare"
    size="inline"
    onclick={() => (showRemaining = !showRemaining)}
    class="font-normal"
  >
    {@render rolling(remainingOrLength)}
  </Button>
{/snippet}

<div
  class={cn(
    "flex items-center gap-2 text-sm leading-none text-muted-foreground tabular-nums",
    className,
  )}
>
  <span class={cn("shrink-0", timeClass)} aria-label="Elapsed time">
    {@render rolling(formatDuration(seekValue))}
  </span>
  {@render seekBar()}
  <span class={cn("shrink-0", timeClass)}>{@render remainingButton()}</span>
</div>
