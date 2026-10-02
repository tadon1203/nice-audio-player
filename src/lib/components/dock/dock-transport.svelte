<script lang="ts">
  import Shuffle from "@lucide/svelte/icons/shuffle";
  import SkipBack from "@lucide/svelte/icons/skip-back";
  import SkipForward from "@lucide/svelte/icons/skip-forward";
  import { getPlayback } from "$lib/playback/context";
  import { nextRepeatMode } from "$lib/playback/snapshot";
  import PlayPauseIcon from "$lib/ui/play-pause-icon.svelte";
  import { Button } from "$lib/ui/shadcn/button";
  import DockToggleButton from "./dock-toggle-button.svelte";
  import PlayProgressRing from "./play-progress-ring.svelte";
  import RepeatIcon from "./repeat-icon.svelte";

  /** Shuffle, previous, play/pause, next, repeat. */
  const playback = getPlayback();
  const playing = $derived(playback.status === "playing");
  const ready = $derived(playback.connection === "ready");
  const playLabel = $derived(playing ? "Pause" : playback.active ? "Resume" : "Play");
</script>

<div
  class="col-start-2 flex min-w-0 items-center justify-self-center gap-1 lg:gap-2"
  data-region="playback-core"
  role="group"
  aria-label="Transport controls"
>
  <DockToggleButton
    label="Shuffle"
    pressed={playback.shuffleEnabled}
    disabled={!ready}
    onclick={() => void playback.setShuffle(!playback.shuffleEnabled)}
    class="max-md:hidden"
  >
    <Shuffle aria-hidden="true" />
  </DockToggleButton>
  <Button
    size="icon-lg"
    variant="ghost"
    aria-label="Previous track"
    title="Previous track"
    disabled={!playback.canGoPrevious}
    onclick={() => void playback.previous()}
  >
    <SkipBack aria-hidden="true" />
  </Button>
  <Button
    size="icon-lg"
    variant="default"
    aria-label={playLabel}
    title={playLabel}
    disabled={!playback.active}
    onclick={() => void (playing ? playback.pause() : playback.resume())}
    class="relative rounded-full transition-[background-color,color,transform] duration-(--motion-press-duration) ease-(--motion-press-easing) active:translate-y-0 active:scale-[0.94] disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100"
  >
    <PlayPauseIcon {playing} />
    {#if playback.active}
      <PlayProgressRing />
    {/if}
  </Button>
  <Button
    size="icon-lg"
    variant="ghost"
    aria-label="Next track"
    title="Next track"
    disabled={!playback.canGoNext}
    onclick={() => void playback.next()}
  >
    <SkipForward aria-hidden="true" />
  </Button>
  <DockToggleButton
    label="Repeat: {playback.repeatMode}"
    pressed={playback.repeatMode !== "off"}
    disabled={!ready}
    onclick={() => void playback.setRepeatMode(nextRepeatMode(playback.repeatMode))}
    class="max-md:hidden"
  >
    <RepeatIcon mode={playback.repeatMode} />
  </DockToggleButton>
</div>
