import { useState } from "react";
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/renderer/shared/ui/button";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { Slider } from "@/renderer/shared/ui/slider";
import { formatDuration } from "@/renderer/shared/lib/format-duration";
import { usePlaybackSession } from "@/renderer/features/playback-control";

export function PlaybackDock() {
  const playback = usePlaybackSession();
  const active = playback.snapshot?.status === "playing" || playback.snapshot?.status === "paused";
  const playing = playback.snapshot?.status === "playing";
  const [seekPreviewMs, setSeekPreviewMs] = useState<number | null>(null);
  const canSeek = active && playback.durationMs !== null;
  const duration = playback.durationMs ?? 1;
  const seekValue = seekPreviewMs ?? playback.positionMs;
  const volumeDb =
    playback.muted || playback.volume <= 0
      ? "−∞ dB"
      : `${(20 * Math.log10(playback.volume)).toFixed(1)} dB`;

  return (
    <footer
      className="grid h-full min-h-0 grid-rows-[16px_minmax(0,1fr)] border-t border-border bg-sidebar"
      aria-label="Playback controls"
      data-slot="playback-dock"
    >
      <div className="flex min-w-0 items-center px-3" data-region="seek">
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

      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_minmax(104px,0.8fr)] grid-rows-[auto_auto] items-center gap-x-2 px-4 pb-1 app-wide:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.75fr)] app-wide:grid-rows-1 app-wide:gap-6 app-wide:px-[clamp(24px,3vw,40px)] app-wide:pb-0">
        <div className="flex min-w-0 items-center gap-2.5" data-region="playback-identity">
          <Artwork
            artwork={playback.artwork}
            alt={playback.title === "Nothing playing" ? "" : `${playback.title} artwork`}
            loading="eager"
            className="size-10 shrink-0 rounded-md"
          />
          <div className="min-w-0">
            <strong className="block truncate text-sm font-medium text-foreground">
              {playback.title}
            </strong>
            {playback.commandError ? (
              <span className="mt-0.5 block truncate text-sm text-destructive" role="alert">
                {playback.commandError}
              </span>
            ) : playback.artist ? (
              <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                {playback.artist}
              </span>
            ) : null}
          </div>
        </div>

        <div
          className="col-span-2 row-start-2 flex min-w-0 items-center justify-center gap-2 app-wide:col-span-1 app-wide:row-start-1 app-wide:gap-3"
          data-region="playback-core"
          aria-label="Transport controls"
        >
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
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
            label={playing ? "Pause" : "Resume"}
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
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {formatDuration(playback.durationMs)}
          </span>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1.5" data-region="volume">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={playback.muted ? "Unmute" : "Mute"}
            disabled={playback.mutePending || playback.connection !== "ready"}
            onClick={() => void playback.toggleMute()}
          >
            {playback.muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </Button>
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
            className="min-w-0 flex-1"
          />
          <span
            className="hidden min-w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground app-wide:inline"
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
      aria-label={label}
      aria-valuetext={valueText}
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
      size="icon-sm"
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
