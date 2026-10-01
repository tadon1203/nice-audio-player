<script lang="ts" module>
  /** The dock's slim progress line: no waveform data, just position. */
  export const DOCK_SEEK_HEIGHT = 6;
  /** Now Playing's hero band: the only place the waveform itself is drawn. */
  export const NOW_PLAYING_WAVEFORM_HEIGHT = 96;
</script>

<script lang="ts">
  import { onMount, tick, type Snippet } from "svelte";
  import { watchClock } from "$lib/playback/clock";
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
   * The seek bar and its elapsed/remaining labels, used by both the dock (a plain progress line,
   * `showWaveform={false}`) and Now Playing (the waveform hero, `showWaveform` defaulted true).
   * They are two separate bars, never morphed into each other: Now Playing's bars grow out of
   * its baseline once the waveform arrives. Only one is mounted at a time, since the dock hides
   * its band while Now Playing is open.
   *
   * `timeLayout="inline"` puts the labels beside the bar instead of on their own row below it,
   * so the whole band is only as tall as one line of text (the dock's shape); `"stacked"` (Now
   * Playing) keeps the labels on their own row under the full-height hero waveform.
   */
  let {
    height,
    showWaveform = true,
    timeLayout = "stacked",
    class: className,
    seekClass,
    timeClass,
    trailing,
  }: {
    height: number;
    showWaveform?: boolean;
    timeLayout?: "stacked" | "inline";
    class?: string;
    seekClass?: string;
    timeClass?: string;
    /** Placed after the remaining time (inline layout only): Now Playing's next track. */
    trailing?: Snippet;
  } = $props();

  const playback = getPlayback();
  const budget = getMotionBudget();
  const itemPath = $derived(playback.item?.file.path ?? "none");
  const canSeek = $derived(playback.transport.active && playback.durationMs !== null);
  const waveform = createPlaybackWaveform(() =>
    showWaveform && playback.transport.active && playback.item ? playback.item.file.path : null,
  );

  // The printed time and the announced value come from the same clock as the bar. They are
  // rounded down to the whole second, so they change once a second instead of every frame.
  const wholeSecondMs = () => Math.floor(playback.clock.estimate() / 1000) * 1000;
  let clockMs = $state(wholeSecondMs());
  $effect(() =>
    // Not the eased position: after a seek the digits go to the new time at once, and spin.
    watchClock(playback.clock, () => (clockMs = wholeSecondMs())),
  );

  let seekPreviewMs = $state<number | null>(null);
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
      watchClock={(listener) => watchClock(playback.clock, listener)}
      sweepBars={showWaveform}
      stillBars={budget.current !== "full"}
      lineOnly={!showWaveform}
      playedClassName={showWaveform ? "text-(--artwork-accent)" : undefined}
      disabled={!canSeek}
      onInput={(value) => (seekPreviewMs = value)}
      onCommit={(value) => {
        const release = playback.clock.hold(value);
        void playback.seek(value).finally(() => {
          release();
          seekPreviewMs = null;
        });
      }}
      activeSpan={lyricsWaveformLink.activeSpan}
      hoveredLineSpan={lyricsWaveformLink.hoveredLineSpan}
      onHoverPositionChange={(ms) => lyricsWaveformLink.setHoveredWaveformMs(ms)}
      class={cn(timeLayout === "inline" && "flex-1", seekClass)}
    />
  {/key}
{/snippet}

{#snippet remainingButton()}
  <button
    type="button"
    aria-pressed={showRemaining}
    aria-label={showRemaining ? "Time remaining" : "Track length"}
    title={showRemaining ? "Show track length" : "Show time remaining"}
    class="shrink-0 cursor-pointer rounded-sm px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    onclick={() => (showRemaining = !showRemaining)}
  >
    {@render rolling(remainingOrLength)}
  </button>
{/snippet}

{#if timeLayout === "inline"}
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
    {@render trailing?.()}
  </div>
{:else}
  <div class={cn("flex flex-col gap-1", className)}>
    {@render seekBar()}
    <div
      class={cn(
        "flex items-center justify-between text-sm text-muted-foreground tabular-nums",
        timeClass,
      )}
      data-region="playback-times"
    >
      <span aria-label="Elapsed time">{@render rolling(formatDuration(seekValue))}</span>
      {@render remainingButton()}
    </div>
  </div>
{/if}
