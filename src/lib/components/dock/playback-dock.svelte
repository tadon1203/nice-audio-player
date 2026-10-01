<script lang="ts">
  import { untrack } from "svelte";
  import { prefersReducedMotion, Tween } from "svelte/motion";
  import { getPlayback } from "$lib/playback/context";
  import { getSettings } from "$lib/settings/context";
  import { nowPlaying } from "$lib/shell/now-playing.svelte";
  import { nowPlayingMotion } from "$lib/shell/now-playing-motion";
  import ArtworkLight from "$lib/ui/artwork-light/artwork-light.svelte";
  import DockIdentity from "./dock-identity.svelte";
  import DockTransport from "./dock-transport.svelte";
  import DockVolume from "./dock-volume.svelte";
  import PlaybackWaveformBand, { DOCK_SEEK_HEIGHT } from "./playback-waveform-band.svelte";

  /** The waveform slot above the transport row, and the gap under it, in px. */
  const SLOT_PX = 12;

  /**
   * Two full-width rows: a plain progress line across the top, then identity, transport and
   * volume. The transport grid's side columns are equal, so the transport sits on the dock's true
   * centre whatever the two sides hold.
   */
  const playback = getPlayback();
  const settings = getSettings();
  const open = $derived(nowPlaying.isOpen);

  // While Now Playing is open the waveform lives up there, so this slot animates shut.
  const slot = new Tween(untrack(() => (open ? 0 : 1)));
  $effect(() => {
    const goal = open ? 0 : 1;
    const motion = nowPlayingMotion(open, prefersReducedMotion.current);
    untrack(() => void slot.set(goal, motion));
  });
</script>

<footer
  class="relative isolate h-full min-h-0 bg-sidebar shadow-[inset_0_1px_0_var(--border)]"
  aria-label="Playback controls"
  data-slot="playback-dock"
>
  {#if settings.artworkBackdrop}
    <ArtworkLight
      artwork={playback.item?.artwork ?? null}
      strength="strong"
      class="mask-[linear-gradient(to_right,black,transparent_85%)]"
    />
  {/if}
  <!-- A real vertical stack, not an overlay: each row consumes its own height, and the
  transport row is pinned to the bottom so it never moves. -->
  <div class="relative flex h-full min-h-0 min-w-0 flex-col justify-end pb-3">
    <div
      class="shrink-0 overflow-hidden"
      style:height="{SLOT_PX * slot.current}px"
      style:margin-bottom="{SLOT_PX * slot.current}px"
    >
      {#if !open}
        <PlaybackWaveformBand
          height={DOCK_SEEK_HEIGHT}
          showWaveform={false}
          timeLayout="inline"
          class="px-2 md:px-4 lg:px-6"
          timeClass="hidden md:inline"
        />
      {/if}
    </div>

    <div
      class="grid min-h-16 min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 px-2 md:px-4 lg:gap-x-6 lg:px-6"
      data-region="playback-main"
    >
      <DockIdentity />
      <DockTransport />
      <DockVolume />
    </div>
  </div>
</footer>
