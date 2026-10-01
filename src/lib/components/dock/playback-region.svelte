<script lang="ts">
  import { untrack } from "svelte";
  import { prefersReducedMotion, Tween } from "svelte/motion";
  import { nowPlaying } from "$lib/shell/now-playing.svelte";
  import { nowPlayingMotion } from "$lib/shell/now-playing-motion";
  import PlaybackDock from "./playback-dock.svelte";

  /** Dock box height in px: waveform slot + transport row + gaps, and without the slot. */
  const DOCK_HEIGHT_PX = 104;
  const DOCK_HEIGHT_NOW_PLAYING_PX = 88;

  const open = $derived(nowPlaying.isOpen);
  const height = new Tween(untrack(() => (open ? DOCK_HEIGHT_NOW_PLAYING_PX : DOCK_HEIGHT_PX)));
  $effect(() => {
    const goal = open ? DOCK_HEIGHT_NOW_PLAYING_PX : DOCK_HEIGHT_PX;
    const motion = nowPlayingMotion(open, prefersReducedMotion.current);
    untrack(() => void height.set(goal, motion));
  });
</script>

<!--
  The transport row is pinned `pb-3` from this box's bottom edge (see PlaybackDock), which is what
  keeps it from moving on screen when Now Playing opens or closes: this row sits in a fixed-height
  grid track whose bottom edge is the window's own bottom edge, so changing this box's height only
  ever eats into the library area above it, never the dock's bottom. Sizing the box to exactly
  row + top gap + bottom gap (64 + 12 + 12 = 88px) while Now Playing is open makes that leftover
  top gap equal the `pb-3` bottom gap.

  The height is animated as a real height, not a transform: scaling would squash the transport
  buttons and the artwork light inside it.
-->
<div class="flex min-h-0 min-w-0 flex-col">
  <div class="min-h-0 shrink-0" style:height="{height.current}px">
    <PlaybackDock />
  </div>
</div>
