<script lang="ts">
  import { getPlayback } from "$lib/playback/context";
  import { getSettings } from "$lib/settings/context";
  import { nowPlaying } from "$lib/shell/now-playing.svelte";
  import { createNowPlayingTween } from "$lib/shell/now-playing-tween.svelte";
  import ArtworkLight from "$lib/ui/artwork-light/artwork-light.svelte";
  import { EDGE_PX, ROW_PX, SLOT_PX } from "./dock-metrics";
  import DockIdentity from "./dock-identity.svelte";
  import DockTransport from "./dock-transport.svelte";
  import DockVolume from "./dock-volume.svelte";
  import PlaybackWaveformBand, {
    DOCK_SEEK_HEIGHT,
  } from "$lib/components/waveform-band/playback-waveform-band.svelte";

  /**
   * Two full-width rows: a plain progress line across the top, then identity, transport and
   * volume. The transport grid's side columns are equal, so the transport sits on the dock's true
   * centre whatever the two sides hold.
   */
  const playback = getPlayback();
  const settings = getSettings();
  // While Now Playing is open the waveform lives up there, so this slot animates shut.
  const slot = createNowPlayingTween(1, 0);
  const open = $derived(nowPlaying.isOpen);
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
  <div
    class="relative flex h-full min-h-0 min-w-0 flex-col justify-end"
    style:padding-bottom="{EDGE_PX}px"
  >
    <div class="shrink-0 overflow-hidden" style:height="{SLOT_PX * slot.current}px">
      {#if !open}
        <PlaybackWaveformBand
          height={DOCK_SEEK_HEIGHT}
          showWaveform={false}
          class="px-2 md:px-4 lg:px-6"
          timeClass="hidden md:inline"
        />
      {/if}
    </div>

    <div
      class="grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 px-2 md:px-4 lg:gap-x-6 lg:px-6"
      style:min-height="{ROW_PX}px"
      data-region="playback-main"
    >
      <DockIdentity />
      <DockTransport />
      <DockVolume />
    </div>
  </div>
</footer>
