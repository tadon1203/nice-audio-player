<script lang="ts">
  import { createNowPlayingTween } from "$lib/shell/now-playing-tween.svelte";
  import { DOCK_HEIGHT_NOW_PLAYING_PX, DOCK_HEIGHT_PX } from "./dock-metrics";
  import PlaybackDock from "./playback-dock.svelte";

  const height = createNowPlayingTween(DOCK_HEIGHT_PX, DOCK_HEIGHT_NOW_PLAYING_PX);
</script>

<!--
  The transport row is pinned EDGE_PX from this box's bottom edge (see PlaybackDock), which is
  what keeps it from moving on screen when Now Playing opens or closes: this row sits in a
  fixed-height grid track whose bottom edge is the window's own bottom edge, so changing this
  box's height only ever eats into the library area above it, never the dock's bottom. While Now
  Playing is open the box is exactly row + top gap + bottom gap (see dock-metrics.ts), which makes
  that leftover top gap equal the bottom gap.

  The height is animated as a real height, not a transform: scaling would squash the transport
  buttons and the artwork light inside it.
-->
<div class="flex min-h-0 min-w-0 flex-col">
  <div class="min-h-0 shrink-0" style:height="{height.current}px">
    <PlaybackDock />
  </div>
</div>
