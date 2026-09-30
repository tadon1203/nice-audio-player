import { useEffect, useState } from "react";
import { m, useAnimationControls } from "motion/react";
import { List, Music2, Volume2, VolumeX } from "lucide-react";
import {
  formatVolumeDb,
  sliderToVolume,
  stepVolumeDb,
  VOLUME_SLIDER_MAX,
  volumeToSlider,
  usePlaybackActions,
  usePlaybackOutput,
  usePlaybackTransport,
} from "@/renderer/entities/playback";
import { useNowPlaying } from "@/renderer/features/now-playing-transition";
import { useQueuePanel } from "@/renderer/widgets/queue-panel";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { DockSignalPath } from "./dock-signal-path";
import { NextTrackPreview } from "./next-track-preview";
import { RollingNumber } from "@/renderer/shared/ui/rolling-number";
import { Slider } from "@/renderer/shared/ui/shadcn/slider";

/**
 * Lyrics and queue toggles, mute, the volume slider (also driven by the wheel) and its readout.
 * The signal path hangs below this row, out of flow, so it never pulls the row off the
 * transport's centre line.
 */
export function DockVolume() {
  const { isOpen: nowPlayingOpen, toggle: onToggleNowPlaying } = useNowPlaying();
  const transport = usePlaybackTransport();
  const output = usePlaybackOutput();
  const playback = usePlaybackActions();
  const { isOpen: queueOpen, toggle: toggleQueue } = useQueuePanel();
  const ready = transport.connection === "ready";
  // Dragging the slider tracks the pointer 1:1; only the wheel and mute roll the readout.
  const [dragging, setDragging] = useState(false);
  const nudge = useAnimationControls();
  useEffect(() => {
    if (!dragging) return;
    const end = () => setDragging(false);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [dragging]);
  // Changing the volume while muted unmutes, so the change is audible.
  const setVolume = (value: number) => {
    playback.setVolume(value);
    if (output.muted && !output.mutePending) void playback.toggleMute();
  };

  return (
    <div
      className="relative col-start-3 flex min-w-0 items-center justify-self-end gap-1.5"
      data-region="volume"
    >
      {/* Out of flow, in the gap before the group, so it never moves anything. */}
      <NextTrackPreview className="absolute top-1/2 right-full mr-4 -translate-y-1/2 max-lg:hidden" />
      <Button
        type="button"
        size="icon-lg"
        variant="ghost"
        aria-label="Now Playing"
        title="Now Playing"
        aria-pressed={nowPlayingOpen}
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
        aria-pressed={queueOpen}
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
        onPointerDown={() => setDragging(true)}
        onWheel={(event) => {
          if (!ready || event.deltaY === 0) return;
          // Pushing past either end of the range nudges the readout instead of doing nothing.
          const atCeiling = event.deltaY < 0 && output.volume >= 1 && !output.muted;
          const atFloor = event.deltaY > 0 && (output.volume <= 0 || output.muted);
          if (atCeiling || atFloor) {
            void nudge.start({ x: [0, atCeiling ? 2 : -2, 0], transition: { duration: 0.12 } });
            return;
          }
          setVolume(stepVolumeDb(output.volume, event.deltaY < 0 ? 1 : -1));
        }}
      >
        <VolumeSlider
          value={output.volume}
          valueText={output.muted ? "Muted" : formatVolumeDb(output.volume, false)}
          disabled={!ready}
          onInput={setVolume}
        />
      </div>
      <span
        className="hidden min-w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground lg:inline"
        data-region="volume-readout"
      >
        <m.span animate={nudge} className="inline-block">
          {dragging ? (
            formatVolumeDb(output.volume, output.muted)
          ) : (
            <RollingNumber value={formatVolumeDb(output.volume, output.muted)} />
          )}
        </m.span>
      </span>
      <DockSignalPath className="absolute top-full right-0 mt-0.5 max-md:hidden" />
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
      max={VOLUME_SLIDER_MAX}
      step={1}
      value={[volumeToSlider(value)]}
      disabled={disabled}
      getAriaLabel={() => "Volume"}
      getAriaValueText={() => valueText}
      onValueChange={(next) => {
        const position = typeof next === "number" ? next : next[0];
        if (position !== undefined) onInput(sliderToVolume(position));
      }}
    />
  );
}
