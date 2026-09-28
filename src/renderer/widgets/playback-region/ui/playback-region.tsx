import { m } from "motion/react";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
import { PlaybackDock } from "./playback-dock";
import { PlaybackStatusBar } from "./playback-status-bar";
import { cn } from "@/renderer/shared/lib/utils";

export function PlaybackRegion({
  nowPlayingOpen,
  onToggleNowPlaying,
}: {
  nowPlayingOpen: boolean;
  onToggleNowPlaying: () => void;
}) {
  const nowPlayingTransition = useMotionTransition("largeMove");

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      {/*
       * The transport row is pinned `pb-3` from this box's bottom edge (see PlaybackDock), which
       * is what keeps it from moving on screen when Now Playing opens or closes: this row sits in
       * a fixed-height grid track whose bottom edge is the window's own bottom edge, so animating
       * this box's height only ever eats into the library area above it, never the dock's bottom.
       * Sizing the box to exactly row + top gap + bottom gap (64 + 12 + 12 = 88px) while Now
       * Playing is open makes that leftover top gap equal the `pb-3` bottom gap, instead of the
       * full slack of the taller collapsed-state box; `layout` animates the change between the
       * two instead of snapping.
       */}
      <m.div
        layout
        transition={nowPlayingTransition}
        className={cn("min-h-0 shrink-0", nowPlayingOpen ? "h-22" : "h-26")}
      >
        <PlaybackDock nowPlayingOpen={nowPlayingOpen} onToggleNowPlaying={onToggleNowPlaying} />
      </m.div>
      <PlaybackStatusBar />
    </div>
  );
}
