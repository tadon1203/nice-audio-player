import { useState } from "react";
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { isActivePlayback, usePlaybackSession } from "@/renderer/features/playback-control";
import { formatDuration } from "@/renderer/shared/lib/format";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { Slider } from "@/renderer/shared/ui/shadcn/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/renderer/shared/ui/shadcn/tooltip";

export function PlaybackDock() {
  const playback = usePlaybackSession();
  const active = isActivePlayback(playback.snapshot);
  const playing = playback.snapshot?.status === "playing";
  const [seekPreviewMs, setSeekPreviewMs] = useState<number | null>(null);
  const [errorTooltipOpen, setErrorTooltipOpen] = useState(false);
  const canSeek = active && playback.durationMs !== null;
  const duration = playback.durationMs ?? 1;
  const seekValue = seekPreviewMs ?? playback.positionMs;
  const volumeDb =
    playback.muted || playback.volume <= 0
      ? "−∞ dB"
      : `${(20 * Math.log10(playback.volume)).toFixed(1)} dB`;

  return (
    <footer
      className="relative h-full min-h-0 border-t border-border bg-sidebar"
      aria-label="Playback controls"
      data-slot="playback-dock"
    >
      <div
        className="absolute inset-x-0 top-0 z-10 flex h-3 min-w-0 items-center"
        data-region="seek"
      >
        <PlaybackSlider
          max={duration}
          value={Math.min(seekValue, duration)}
          label="Playback position"
          valueText={`${formatDuration(seekValue)} of ${formatDuration(playback.durationMs)}`}
          disabled={!canSeek || playback.seekPending}
          onInput={setSeekPreviewMs}
          onCommit={(value) => {
            void playback.seek(value).finally(() => setSeekPreviewMs(null));
          }}
          className="h-3"
        />
      </div>

      <div
        className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 lg:gap-6 lg:px-6"
        data-region="playback-main"
      >
        <div
          className="flex min-w-0 items-center gap-2.5 justify-self-start"
          data-region="playback-identity"
        >
          <Artwork
            artwork={playback.artwork}
            alt={playback.title === "Nothing playing" ? "" : `${playback.title} artwork`}
            loading="eager"
            className="size-10 shrink-0"
          />
          <div className="min-w-0">
            <strong
              className="block truncate text-sm font-medium text-foreground"
              title={playback.title}
            >
              {playback.title}
            </strong>
            {playback.commandError ? (
              <Tooltip open={errorTooltipOpen} onOpenChange={setErrorTooltipOpen}>
                <TooltipTrigger
                  render={
                    <span
                      className="mt-0.5 block truncate text-sm text-destructive"
                      role="alert"
                      tabIndex={0}
                    />
                  }
                  onFocus={() => setErrorTooltipOpen(true)}
                  onBlur={() => setErrorTooltipOpen(false)}
                >
                  {playback.commandError}
                </TooltipTrigger>
                <TooltipContent>{playback.commandError}</TooltipContent>
              </Tooltip>
            ) : playback.artist ? (
              <span
                className="mt-0.5 block truncate text-sm text-muted-foreground"
                title={playback.artist}
              >
                {playback.artist}
              </span>
            ) : null}
          </div>
        </div>

        <div
          className="flex min-w-0 items-center justify-self-center gap-2 lg:gap-3"
          data-region="playback-core"
          aria-label="Transport controls"
        >
          <span className="hidden shrink-0 text-sm tabular-nums text-muted-foreground sm:inline">
            {formatDuration(seekValue)}
          </span>
          <TransportButton
            label="Previous track"
            disabled={!playback.snapshot?.canGoPrevious || playback.transportPending !== null}
            onClick={() => void playback.previous()}
          >
            <SkipBack aria-hidden="true" />
          </TransportButton>
          <TransportButton
            label={playing ? "Pause" : active ? "Resume" : "Play"}
            disabled={!active || playback.transportPending !== null}
            onClick={() => void (playing ? playback.pause() : playback.resume())}
            variant="default"
          >
            {playing ? (
              <Pause aria-hidden="true" fill="currentColor" />
            ) : (
              <Play aria-hidden="true" fill="currentColor" />
            )}
          </TransportButton>
          <TransportButton
            label="Next track"
            disabled={!playback.snapshot?.canGoNext || playback.transportPending !== null}
            onClick={() => void playback.next()}
          >
            <SkipForward aria-hidden="true" />
          </TransportButton>
          <span className="hidden shrink-0 text-sm tabular-nums text-muted-foreground sm:inline">
            {formatDuration(playback.durationMs)}
          </span>
        </div>

        <div className="flex min-w-0 items-center justify-self-end gap-1.5" data-region="volume">
          <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            aria-label={playback.muted ? "Unmute" : "Mute"}
            disabled={playback.mutePending || playback.connection !== "ready"}
            onClick={() => void playback.toggleMute()}
          >
            {playback.muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </Button>
          <div className="w-24 shrink-0 sm:w-28" data-region="volume-slider">
            <PlaybackSlider
              max={1}
              step={0.01}
              value={playback.volume}
              label="Volume"
              valueText={playback.muted ? "Muted" : `${Math.round(playback.volume * 100)} percent`}
              disabled={playback.connection !== "ready"}
              onInput={(value) => {
                playback.setVolume(value);
                if (playback.muted && !playback.mutePending) void playback.toggleMute();
              }}
              className="w-full"
            />
          </div>
          <span
            className="hidden min-w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground lg:inline"
            data-region="volume-readout"
          >
            {volumeDb}
          </span>
        </div>
      </div>
    </footer>
  );
}

function PlaybackSlider({
  value,
  max,
  step = 1,
  label,
  valueText,
  disabled,
  className,
  onInput,
  onCommit,
}: {
  value: number;
  max: number;
  step?: number;
  label: string;
  valueText?: string;
  disabled?: boolean;
  className?: string;
  onInput?: (value: number) => void;
  onCommit?: (value: number) => void;
}) {
  const readValue = (next: number | readonly number[]) =>
    typeof next === "number" ? next : (next[0] ?? value);
  return (
    <Slider
      className={className}
      min={0}
      max={max}
      step={step}
      value={[value]}
      disabled={disabled}
      getAriaLabel={() => label}
      getAriaValueText={valueText === undefined ? undefined : () => valueText}
      onValueChange={(next) => onInput?.(readValue(next))}
      onValueCommitted={(next) => onCommit?.(readValue(next))}
    />
  );
}

function TransportButton({
  label,
  children,
  disabled,
  onClick,
  variant = "ghost",
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  variant?: "default" | "ghost";
}) {
  return (
    <Button
      type="button"
      size="icon-lg"
      variant={variant}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
