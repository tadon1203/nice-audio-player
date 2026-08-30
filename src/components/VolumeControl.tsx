import type { PlaybackSnapshot } from "@/bindings";
import { RangeControl } from "./RangeControl";
import { Button } from "./ui/button";
import { StateIcon } from "./ui/StateIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface VolumeControlProps {
  playback: PlaybackSnapshot;
  value: number;
  isPlaybackAvailable: boolean;
  isVolumeUpdatePending: boolean;
  isMutePending: boolean;
  onValueChange: (value: number) => void;
  onValueCommitted: (value: number) => void;
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
  onValueCommitted,
  onInteractionCancel,
  onVolumeButtonPress,
}: VolumeControlProps) {
  const muted = playback.muted;
  const iconState = muted || value === 0 ? "silent" : value < 50 ? "low" : "high";
  const buttonLabel = value === 0 ? "Restore volume" : muted ? "Unmute" : "Mute";
  const valueText = value === 0 ? "0 percent, silent" : `${value} percent${muted ? ", muted" : ""}`;
  return (
    <div
      className="grid w-[192px] grid-cols-[auto_minmax(0,1fr)] items-center gap-2"
      data-region="volume"
      aria-busy={isMutePending || undefined}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="icon-primary"
              type="button"
              aria-label={buttonLabel}
              aria-busy={isMutePending || undefined}
              disabled={!isPlaybackAvailable || isMutePending}
              onClick={onVolumeButtonPress}
            />
          }
        >
          <span
            className="[&>svg]:h-7 [&>svg]:w-7"
            data-testid="volume-icon-state"
            data-state={iconState}
          >
            <StateIcon state={iconState} size={28} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{buttonLabel}</TooltipContent>
      </Tooltip>
      <RangeControl
        aria-label="Playback volume"
        aria-valuetext={valueText}
        value={value}
        min={0}
        max={100}
        step={1}
        appearance={muted ? "subdued" : "default"}
        disabled={!isPlaybackAvailable}
        onValueChange={onValueChange}
        onValueCommitted={onValueCommitted}
        onInteractionCancel={onInteractionCancel}
      />
      {isVolumeUpdatePending ? <span className="sr-only">Updating volume</span> : null}
    </div>
  );
}
