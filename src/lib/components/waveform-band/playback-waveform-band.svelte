<script lang="ts" module>
  /** The dock's slim progress line: no waveform data, just position. */
  export const DOCK_SEEK_HEIGHT = 6;
</script>

<script lang="ts">
  import { Button } from "#lib/components/ui/shadcn/button";
  import { useApp } from "#lib/app/app.svelte";
  import RollingNumber from "#lib/components/ui/rolling-number/rolling-number.svelte";
  import WaveformSeek from "#lib/components/ui/waveform/waveform-seek.svelte";
  import { cn } from "#lib/utils/cn.js";
  import { DurationFormat } from "#lib/utils/duration-format";
  import { SeekDrag } from "./seek-drag.svelte";
  import { SeekSpin } from "./seek-spin.svelte";

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

  const { player: playback, motion, actions } = useApp();
  const app = useApp();

  const trackKey = $derived(playback.item?.id ?? "none");
  const canSeek = $derived(playback.isActive && playback.durationMs !== null);
  const waveform = $derived(showWaveform ? playback.waveform : null);

  // The printed time and the announced value come from the same clock as the bar. They are
  // rounded down to the whole second, so they change once a second instead of every frame.
  // `$effect` stays: `onBoundary` is a clock subscription whose teardown runs with the effect, and
  // the value it sets is the one the time digits read.
  let clockMs = $state(Math.floor(playback.clock.estimate() / 1000) * 1000);
  $effect(() =>
    // Not the eased position: after a seek the digits go to the new time at once, and spin.
    playback.clock.onBoundary(
      (positionMs) => Math.floor(positionMs / 1000 + 1) * 1000,
      (positionMs) => (clockMs = Math.floor(positionMs / 1000) * 1000),
    ),
  );

  const seekDrag = new SeekDrag();
  let showRemaining = $state(true);
  const seekValue = $derived(seekDrag.preview ?? clockMs);
  const spin = new SeekSpin(() => seekDrag.dragging);

  const remainingOrLength = $derived(
    playback.durationMs === null
      ? DurationFormat.of(null)
      : showRemaining
        ? `−${DurationFormat.of(Math.max(0, playback.durationMs - seekValue))}`
        : DurationFormat.of(playback.durationMs),
  );
</script>

{#snippet rolling(text: string)}
  <!-- Dragging tracks the pointer 1:1. Otherwise the digits roll only for a jump (a seek); the
  ordinary tick of a second is a plain rewrite, so the time does not add a second thing that
  moves all the time. A new track does not spin back. -->
  {#if seekDrag.dragging}
    {text}
  {:else}
    {#key trackKey}
      <RollingNumber value={text} spin={spin.turns} instant={spin.turns === 0} />
    {/key}
  {/if}
{/snippet}

{#snippet seekBar()}
  {#key trackKey}
    <WaveformSeek
      {height}
      rms={showWaveform ? (waveform?.rms ?? null) : null}
      showPlayhead={showWaveform}
      valueMs={seekValue}
      durationMs={playback.durationMs}
      drive={playback.clock.drive}
      sweepBars={showWaveform}
      stillBars={!motion.breathing}
      lineOnly={!showWaveform}
      disabled={!canSeek}
      onInput={seekDrag.input}
      onCancel={seekDrag.cancel}
      onCommit={(value) => actions.run(() => seekDrag.commit(value))}
      activeSpan={app.lyricsActiveSpan}
      hoveredLineSpan={app.lyricsHoveredLineSpan}
      onHoverPositionChange={(ms) => (app.waveformHoveredMs = ms)}
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
    {@render rolling(DurationFormat.of(seekValue))}
  </span>
  {@render seekBar()}
  <span class={cn("shrink-0", timeClass)}>{@render remainingButton()}</span>
</div>
