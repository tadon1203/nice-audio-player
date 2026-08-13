import type { PlaybackSnapshot } from "@/bindings";
import { RangeControl } from "./RangeControl";
import { VolumeIcon } from "./icons";

interface VolumeControlProps {
  playback: PlaybackSnapshot;
  value: number;
  isPlaybackAvailable: boolean;
  isVolumeUpdatePending: boolean;
  isMutePending: boolean;
  onValueChange: (value: number) => void;
  onInteractionStart: () => void;
  onValueCommit: (value: number) => void;
  onInteractionCancel: () => void;
  onVolumeButtonPress: () => void;
}

export function VolumeControl({
  playback,
  value,
  isPlaybackAvailable,
  isVolumeUpdatePending,
  isMutePending,
  onValueChange,
  onInteractionStart,
  onValueCommit,
  onInteractionCancel,
  onVolumeButtonPress,
}: VolumeControlProps) {
  const muted = playback.muted;
  const iconState = muted || value === 0 ? "silent" : value < 50 ? "low" : "high";
  const buttonLabel = value === 0 ? "Restore volume" : muted ? "Unmute" : "Mute";
  const valueText = value === 0 ? "0 percent, silent" : `${value} percent${muted ? ", muted" : ""}`;
  return (
    <div
      className="playback-dock__volume"
      data-region="volume"
      aria-busy={isMutePending || undefined}
    >
      <button
        type="button"
        aria-label={buttonLabel}
        aria-busy={isMutePending || undefined}
        disabled={!isPlaybackAvailable || isMutePending}
        onClick={onVolumeButtonPress}
        className="playback-dock__fixed-control playback-dock__volume-button grid size-10 place-items-center text-text-primary disabled:cursor-not-allowed disabled:text-text-disabled"
      >
        <span data-testid="volume-icon-state" data-state={iconState}>
          <VolumeIcon state={iconState} className="playback-dock__volume-icon" />
        </span>
      </button>
      <RangeControl
        aria-label="Playback volume"
        aria-valuetext={valueText}
        value={value}
        min={0}
        max={100}
        step={1}
        subdued={muted}
        disabled={!isPlaybackAvailable}
        onValueChange={onValueChange}
        onInteractionStart={onInteractionStart}
        onValueCommit={onValueCommit}
        onInteractionCancel={onInteractionCancel}
      />
      {isVolumeUpdatePending ? <span className="sr-only">Updating volume</span> : null}
    </div>
  );
}
