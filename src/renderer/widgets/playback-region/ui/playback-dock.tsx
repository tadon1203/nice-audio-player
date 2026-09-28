import { useRef } from "react";
import { m } from "motion/react";
import { usePlaybackItem } from "@/renderer/entities/playback";
import { cn } from "@/renderer/shared/lib/utils";
import { ArtworkLight } from "@/renderer/shared/ui/artwork-light";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
import { DockIdentity } from "./dock-identity";
import { DockTransport } from "./dock-transport";
import { DockVolume } from "./dock-volume";
import { DOCK_SEEK_HEIGHT, PlaybackWaveformBand } from "./playback-waveform-band";

/** Layout intent (two full-width rows, centered transport) is in DESIGN.md, "Dock". */
export function PlaybackDock({
  nowPlayingOpen,
  onToggleNowPlaying,
}: {
  nowPlayingOpen: boolean;
  onToggleNowPlaying: () => void;
}) {
  // Nothing read here changes with playback position, so the dock does not re-render as time
  // passes.
  const item = usePlaybackItem();
  const trackKey = item?.file.path ?? "none";
  const trackChangeTransition = useMotionTransition("mediumMove");
  const nowPlayingTransition = useMotionTransition("largeMove");
  // Next exits to the left, previous exits to the right; anything else (a fresh track from the
  // library, auto-advance) defaults to "forward". Read at render time by the identity block,
  // which re-renders when the new snapshot for `trackKey` arrives.
  const directionRef = useRef<1 | -1>(1);

  return (
    <footer
      className="relative isolate h-full min-h-0 bg-sidebar shadow-[inset_0_1px_0_var(--border)]"
      aria-label="Playback controls"
      data-slot="playback-dock"
    >
      <ArtworkLight
        artwork={item?.artwork ?? null}
        strength="strong"
        className="mask-[linear-gradient(to_right,black,transparent_85%)]"
      />
      {/* A real vertical stack, not an overlay: each row consumes its own height, and the
          transport row is pinned to the bottom so it never moves. */}
      <div className="relative flex h-full min-h-0 min-w-0 flex-col justify-end pb-3">
        {/* While Now Playing is open the waveform lives up there, so this slot animates shut. */}
        <m.div
          layout
          transition={nowPlayingTransition}
          className={cn("shrink-0 overflow-hidden", nowPlayingOpen ? "h-0" : "mb-3 h-3")}
        >
          {nowPlayingOpen ? null : (
            <PlaybackWaveformBand
              height={DOCK_SEEK_HEIGHT}
              showWaveform={false}
              timeLayout="inline"
              className="px-2 md:px-4 lg:px-6"
              timeClassName="hidden md:inline"
            />
          )}
        </m.div>

        <div
          className="grid min-h-16 min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 px-2 md:px-4 lg:gap-x-6 lg:px-6"
          data-region="playback-main"
        >
          <DockIdentity
            item={item}
            nowPlayingOpen={nowPlayingOpen}
            onToggleNowPlaying={onToggleNowPlaying}
            trackKey={trackKey}
            direction={directionRef.current}
            trackChangeTransition={trackChangeTransition}
          />
          <DockTransport
            onDirection={(direction) => {
              directionRef.current = direction;
            }}
          />
          <DockVolume onToggleNowPlaying={onToggleNowPlaying} />
        </div>
      </div>
    </footer>
  );
}
