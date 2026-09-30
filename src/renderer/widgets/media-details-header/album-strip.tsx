import { m, useTransform } from "motion/react";
import { usePlaybackClock, usePlaybackDuration } from "@/renderer/entities/playback";
import { cn } from "@/renderer/shared/lib/utils";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/renderer/shared/ui/shadcn/tooltip";
import { segmentFill, segmentStarts, segmentStates } from "./album-strip-model";

/** The bars-grow-in sweep, the same 320ms as the Now Playing waveform. */
const SWEEP_S = 0.32;

export type AlbumStripTrack = {
  id: string;
  title: string;
  durationMs: number | null;
  playable: boolean;
  availability: string;
};

const PAST = "bg-foreground/60";
const IDLE = "bg-foreground/25";

/**
 * Segments proportional to each track's length. They grow in left to right on entry; for the
 * playing album, past tracks are brighter, and the playing segment fills as it plays.
 */
export function AlbumStrip({
  tracks,
  activeTrackId,
  onPlayTrack,
}: {
  tracks: readonly AlbumStripTrack[];
  activeTrackId: string | null;
  onPlayTrack: (id: string) => void;
}) {
  const transition = useMotionTransition("mediumMove");
  const totalMs = tracks.reduce((sum, track) => sum + (track.durationMs ?? 0), 0);
  if (totalMs <= 0) return null;
  const states = segmentStates(tracks, activeTrackId);
  const starts = segmentStarts(tracks);

  return (
    <div className="flex h-1 w-full gap-0.5" role="group" aria-label="Track lengths">
      {tracks.map((track, index) => {
        const state = states[index]!;
        const playable = track.playable && track.availability === "available";
        return (
          <Tooltip key={track.id}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={track.title}
                  aria-current={state === "current" ? "true" : undefined}
                  // Pointer-only: the track table below is the keyboard path to the same tracks.
                  tabIndex={-1}
                  disabled={!playable}
                  onClick={() => onPlayTrack(track.id)}
                  className="group/segment relative h-full min-w-0.5 cursor-pointer rounded-full outline-none before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] disabled:cursor-default"
                  style={{ flexGrow: track.durationMs ?? 0 }}
                />
              }
            >
              <m.span
                aria-hidden="true"
                className={cn(
                  "absolute inset-0 origin-left overflow-clip rounded-full transition-colors",
                  state === "past" ? PAST : IDLE,
                  state === "future" && "group-hover/segment:bg-foreground/60",
                )}
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ ...transition, delay: (starts[index] ?? 0) * SWEEP_S }}
              />
              {state === "current" ? <SegmentFill durationMs={track.durationMs} /> : null}
            </TooltipTrigger>
            <TooltipContent>{track.title}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** The only part that reads the position, so the strip and page do not re-render with time. */
function SegmentFill({ durationMs: rowDurationMs }: { durationMs: number | null }) {
  const total = usePlaybackDuration() ?? rowDurationMs;
  const position = usePlaybackClock();
  const scaleX = useTransform(position, (p) => segmentFill(p, total));
  return (
    <m.span
      aria-hidden="true"
      className="absolute inset-0 origin-left rounded-full bg-foreground"
      style={{ scaleX }}
    />
  );
}
