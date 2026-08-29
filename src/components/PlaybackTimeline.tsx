import { formatPlaybackTime } from "@/lib/playback-time";
import { RangeControl } from "./RangeControl";

interface PlaybackTimelineProps {
  duration: number | null;
  value: number;
  available: boolean;
  pending: boolean;
  transportPending: boolean;
  onChange(value: number): void;
  onCommit(value: number): void;
  onCancel(): void;
}

export function PlaybackTimeline({
  duration,
  value,
  available,
  pending,
  transportPending,
  onChange,
  onCommit,
  onCancel,
}: PlaybackTimelineProps) {
  const timed = duration !== null;
  return (
    <div
      className={`playback-dock__timeline${pending || transportPending ? " is-pending" : ""}${!timed ? " is-idle" : ""}`}
    >
      {timed ? (
        <div className="flex justify-between text-body-sm text-text-secondary">
          <span className="tabular-nums">{formatPlaybackTime(value)}</span>
          <span className="tabular-nums">{formatPlaybackTime(duration)}</span>
        </div>
      ) : (
        <div aria-hidden="true" />
      )}
      <RangeControl
        aria-label="Playback position"
        aria-valuetext={`${formatPlaybackTime(value)} of ${timed ? formatPlaybackTime(duration) : "--:--"}`}
        min={0}
        max={duration ?? 0}
        step={1}
        value={value}
        disabled={!available || !timed || pending || transportPending}
        onValueChange={onChange}
        onValueCommitted={onCommit}
        onInteractionCancel={onCancel}
      />
    </div>
  );
}
