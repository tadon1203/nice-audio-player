import { AnimatePresence, m } from "motion/react";
import {
  usePlaybackItem,
  usePlaybackPosition,
  usePlaybackQueue,
  usePlaybackTransport,
} from "@/entities/playback";
import { cn } from "@/shared/lib/utils";
import { Artwork } from "@/shared/ui/artwork";
import { useMotionTransition } from "@/shared/ui/motion";

/** The next track's artwork shows this long before the current one ends. */
const PREVIEW_MS = 3_000;

/**
 * In the last three seconds of a track, the next track's artwork slides in at the dock's edge
 * and goes when the track changes (the Sleeve's own slide takes over). Nothing shows for
 * repeat-one, at the end of the queue, or when the next artwork is the one already on the
 * Sleeve (the same artwork is never shown in two places). It reads the position itself.
 */
export function NextTrackPreview({ className }: { className?: string }) {
  const item = usePlaybackItem();
  const { queue, repeatMode } = usePlaybackQueue();
  const { positionMs, durationMs } = usePlaybackPosition();
  const playing = usePlaybackTransport().status === "playing";
  const transition = useMotionTransition("smallMove");
  const next = queue?.upcoming[0] ?? null;
  const remaining = durationMs === null ? Infinity : durationMs - positionMs;
  const show =
    next !== null &&
    playing &&
    repeatMode !== "one" &&
    remaining > 0 &&
    remaining <= PREVIEW_MS &&
    next.artwork?.contentHash !== item?.artwork?.contentHash;

  return (
    <AnimatePresence>
      {show ? (
        <m.span
          key={next.id}
          aria-hidden="true"
          data-slot="next-track-preview"
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 0.6, x: 0 }}
          exit={{ opacity: 0, x: 8 }}
          transition={transition}
          className={cn("block size-6", className)}
        >
          <Artwork artwork={next.artwork} className="size-full rounded-sm" />
        </m.span>
      ) : null}
    </AnimatePresence>
  );
}
