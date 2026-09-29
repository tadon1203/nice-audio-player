import { List, Music2, Volume2, VolumeX } from "lucide-react";
import {
  formatVolumeDb,
  stepVolumeDb,
  usePlaybackActions,
  usePlaybackOutput,
  usePlaybackTransport,
} from "@/renderer/entities/playback";
import { useNowPlaying } from "@/renderer/features/now-playing-transition";
import { useQueuePanel } from "@/renderer/widgets/queue-panel";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { Slider } from "@/renderer/shared/ui/shadcn/slider";

/** Lyrics and queue toggles, mute, the volume slider (also driven by the wheel) and its readout. */
export function DockVolume() {
  const { toggle: onToggleNowPlaying } = useNowPlaying();
  const transport = usePlaybackTransport();
  const output = usePlaybackOutput();
  const playback = usePlaybackActions();
  const { toggle: toggleQueue } = useQueuePanel();
  const ready = transport.connection === "ready";
  // Changing the volume while muted unmutes, so the change is audible.
  const setVolume = (value: number) => {
    playback.setVolume(value);
    if (output.muted && !output.mutePending) void playback.toggleMute();
  };

  return (
    <div
      className="col-start-3 flex min-w-0 items-center justify-self-end gap-1.5"
      data-region="volume"
    >
      <Button
        type="button"
        size="icon-lg"
        variant="ghost"
        aria-label="Lyrics"
        title="Lyrics"
        disabled={!transport.active}
        onClick={onToggleNowPlaying}
        className="max-md:hidden"
      >
        <Music2 aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-lg"
        variant="ghost"
        aria-label="Queue"
        title="Queue"
        onClick={toggleQueue}
        className="max-md:hidden"
      >
        <List aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon-lg"
        variant="ghost"
        aria-label={output.muted ? "Unmute" : "Mute"}
        disabled={output.mutePending || !ready}
        onClick={() => void playback.toggleMute()}
      >
        {output.muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </Button>
      <div
        className="w-24 shrink-0 sm:w-28"
        data-region="volume-slider"
        onWheel={(event) => {
          if (!ready || event.deltaY === 0) return;
          setVolume(stepVolumeDb(output.volume, event.deltaY < 0 ? 1 : -1));
        }}
      >
        <VolumeSlider
          value={output.volume}
          valueText={output.muted ? "Muted" : `${Math.round(output.volume * 100)} percent`}
          disabled={!ready}
          onInput={setVolume}
        />
      </div>
      <span
        className="hidden min-w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground lg:inline"
        data-region="volume-readout"
      >
        {formatVolumeDb(output.volume, output.muted)}
      </span>
    </div>
  );
}

function VolumeSlider({
  value,
  valueText,
  disabled,
  onInput,
}: {
  value: number;
  valueText: string;
  disabled: boolean;
  onInput: (value: number) => void;
}) {
  return (
    <Slider
      className="w-full"
      min={0}
      max={1}
      step={0.01}
      value={[value]}
      disabled={disabled}
      getAriaLabel={() => "Volume"}
      getAriaValueText={() => valueText}
      onValueChange={(next) => onInput(typeof next === "number" ? next : (next[0] ?? value))}
    />
  );
}
