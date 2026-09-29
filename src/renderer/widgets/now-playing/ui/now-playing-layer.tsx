import type { ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import {
  useNowPlaying,
  useNowPlayingTransitions,
} from "@/renderer/features/now-playing-transition";

/** How far the surface travels while lifting in, in px. Small: it is a lift, not a slide. */
const LIFT_PX = 24;

/**
 * The Now Playing layer: full width (sidebar included), from below the title bar to the top
 * of the dock, drawn over the library rather than instead of it. The surface lifts and fades
 * in; it is deliberately not clipped, so the Sleeve can travel in from the dock without being
 * cut off (the Light clips itself). The close affordance lives in the dock's own Sleeve slot,
 * not here — the same object never appears twice. Place it as a direct child of the shell grid.
 */
export function NowPlayingLayer({ children }: { children?: ReactNode }) {
  const { isOpen } = useNowPlaying();
  const transitions = useNowPlayingTransitions();

  return (
    <AnimatePresence>
      {isOpen ? (
        <m.section
          key="now-playing"
          aria-label="Now Playing"
          data-slot="now-playing"
          initial={{ opacity: 0, y: LIFT_PX }}
          animate={{ opacity: 1, y: 0, transition: transitions.open }}
          exit={{ opacity: 0, y: LIFT_PX, transition: transitions.close }}
          className="relative z-10 col-span-full row-start-2 min-h-0 min-w-0 bg-background"
        >
          {children}
        </m.section>
      ) : null}
    </AnimatePresence>
  );
}
