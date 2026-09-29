import { m } from "motion/react";
import {
  useNowPlaying,
  useNowPlayingTransitions,
} from "@/renderer/features/now-playing-transition";
import { PlaybackDock } from "./playback-dock";
import { PlaybackStatusBar } from "./playback-status-bar";

/** Dock box height in px: waveform slot + transport row + gaps (h-26), and without the slot (h-22). */
const DOCK_HEIGHT_PX = 104;
const DOCK_HEIGHT_NOW_PLAYING_PX = 88;

export function PlaybackRegion() {
  const { isOpen: nowPlayingOpen } = useNowPlaying();
  const transitions = useNowPlayingTransitions();

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      {/*
       * The transport row is pinned `pb-3` from this box's bottom edge (see PlaybackDock), which
       * is what keeps it from moving on screen when Now Playing opens or closes: this row sits in
       * a fixed-height grid track whose bottom edge is the window's own bottom edge, so changing
       * this box's height only ever eats into the library area above it, never the dock's bottom.
       * Sizing the box to exactly row + top gap + bottom gap (64 + 12 + 12 = 88px) while Now
       * Playing is open makes that leftover top gap equal the `pb-3` bottom gap.
       *
       * The height is animated as a real height, not a `layout` transform: a layout animation
       * scales the box, which squashes the transport buttons and the artwork light inside it.
       */}
      <m.div
        initial={false}
        animate={{ height: nowPlayingOpen ? DOCK_HEIGHT_NOW_PLAYING_PX : DOCK_HEIGHT_PX }}
        transition={nowPlayingOpen ? transitions.open : transitions.close}
        className="min-h-0 shrink-0"
      >
        <PlaybackDock />
      </m.div>
      <PlaybackStatusBar />
    </div>
  );
}
