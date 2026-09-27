import type { ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
import { useNowPlaying } from "../model/use-now-playing";

/**
 * The Now Playing layer: full width (sidebar included), from below the title bar to the top
 * of the dock. It grows upward from the dock's top edge with `clip-path` so the Light reads
 * as one surface with the dock, and is drawn over the library rather than instead of it. The
 * close affordance lives in the dock's own Sleeve slot (it swaps to a `⌄`), not here — the
 * same object never appears twice. Place it as a direct child of the shell grid.
 */
export function NowPlayingLayer({ children }: { children?: ReactNode }) {
  const { isOpen } = useNowPlaying();
  const transition = useMotionTransition("largeMove");

  return (
    <AnimatePresence>
      {isOpen ? (
        <m.section
          key="now-playing"
          aria-label="Now Playing"
          data-slot="now-playing"
          initial={{ clipPath: "inset(100% 0% 0% 0%)" }}
          animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
          exit={{ clipPath: "inset(100% 0% 0% 0%)" }}
          transition={transition}
          className="relative z-10 col-span-full row-start-2 min-h-0 min-w-0 overflow-hidden bg-background"
        >
          {children}
        </m.section>
      ) : null}
    </AnimatePresence>
  );
}
