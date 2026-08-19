import { Pause, Play, Repeat1, Repeat2, Volume1, Volume2, VolumeX } from "lucide";
import { MorphIcon } from "morphicons/react";

type StateIconState = "play" | "pause" | "silent" | "low" | "high" | "repeat" | "repeatOne";

const endpoints = {
  play: Play,
  pause: Pause,
  silent: VolumeX,
  low: Volume1,
  high: Volume2,
  repeat: Repeat2,
  repeatOne: Repeat1,
} as const;

/** Owns continuity between endpoints of one semantic control. */
export function StateIcon({ state, className }: { state: StateIconState; className?: string }) {
  return (
    <MorphIcon
      icon={endpoints[state]}
      spring="smooth"
      reducedMotion="user"
      className={className}
      size={state === "play" || state === "pause" ? 24 : 20}
      strokeWidth={2}
      aria-hidden="true"
      focusable="false"
    />
  );
}
