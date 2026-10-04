<script lang="ts">
  import Shuffle from "@lucide/svelte/icons/shuffle";
  import SkipBack from "@lucide/svelte/icons/skip-back";
  import SkipForward from "@lucide/svelte/icons/skip-forward";
  import { getPlayback } from "$lib/playback/context";
  import { nextRepeatMode } from "$lib/playback/snapshot";
  import PlayPauseIcon from "$lib/ui/play-pause-icon.svelte";
  import { Button } from "$lib/ui/shadcn/button";
  import DockToggleButton from "./dock-toggle-button.svelte";
  import RepeatIcon from "./repeat-icon.svelte";

  /** Shuffle, previous, play/pause, next, repeat. */
  const playback = getPlayback();
  const playing = $derived(playback.status === "playing");
  const ready = $derived(playback.connection === "ready");
  const failed = $derived(playback.failure !== null);
  const playLabel = $derived(
    playing ? "Pause" : failed ? "Retry" : playback.active ? "Resume" : "Play",
  );
</script>

<div
  class="col-start-2 flex min-w-0 items-center justify-self-center gap-1 lg:gap-2"
  data-region="playback-core"
  role="group"
  aria-label="Transport controls"
>
  <div class="max-md:hidden">
    <DockToggleButton
      label="Shuffle"
      pressed={playback.shuffleEnabled}
      disabled={!ready}
      onclick={() => void playback.setShuffle(!playback.shuffleEnabled)}
    >
      <Shuffle aria-hidden="true" />
    </DockToggleButton>
  </div>
  <Button
    size="largeIcon"
    variant="quiet"
    aria-label="Previous track"
    title="Previous track"
    disabled={!playback.canGoPrevious}
    onclick={() => void playback.previous()}
  >
    <SkipBack aria-hidden="true" />
  </Button>
  <Button
    size="largeIcon"
    variant="primary"
    aria-label={playLabel}
    title={playLabel}
    disabled={!playback.active && !failed}
    onclick={() => void (playing ? playback.pause() : playback.resume())}
    class="relative rounded-full hover:bg-primary active:translate-y-0 active:scale-[0.94] disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100"
  >
    <PlayPauseIcon {playing} />
  </Button>
  <Button
    size="largeIcon"
    variant="quiet"
    aria-label="Next track"
    title="Next track"
    disabled={!playback.canGoNext}
    onclick={() => void playback.next()}
  >
    <SkipForward aria-hidden="true" />
  </Button>
  <div class="max-md:hidden">
    <DockToggleButton
      label="Repeat: {playback.repeatMode}"
      pressed={playback.repeatMode !== "off"}
      disabled={!ready}
      onclick={() => void playback.setRepeatMode(nextRepeatMode(playback.repeatMode))}
    >
      <RepeatIcon mode={playback.repeatMode} />
    </DockToggleButton>
  </div>
</div>
