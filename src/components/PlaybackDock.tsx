import type {
  AudioOutputDevice,
  AudioOutputSelection,
  PlaybackSnapshot,
  ValidatedAudioFile,
} from "@/bindings";
import { formatPlaybackTime } from "@/lib/playback-time";

import { OutputDeviceIcon, PlayPauseIcon, RefreshIcon, StopIcon, VolumeIcon } from "./icons";
import { ResponsiveCluster } from "./layout/ResponsiveCluster";

type PendingTransportCommand = "start" | "stop" | "pause" | "resume" | null;

interface PlaybackDockProps {
  playback: PlaybackSnapshot;
  validatedFile: ValidatedAudioFile | null;
  outputDevices: AudioOutputDevice[] | null;
  isLoadingDevices: boolean;
  isOutputSelectionPending: boolean;
  isTransportCommandPending: boolean;
  pendingTransportCommand: PendingTransportCommand;
  isScrubbing: boolean;
  positionDraft: number;
  isSeekPending: boolean;
  isAdjustingVolume: boolean;
  volumeDraft: number;
  isVolumePending: boolean;
  statusMessage: string;
  playbackError: string | null;
  deviceListError: string | null;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSeek: (value: number) => void;
  onSeekCommit: (value: number) => void;
  onSeekCancel: () => void;
  onVolumeChange: (value: number) => void;
  onVolumePointerDown: () => void;
  onVolumeCommit: (value: number) => void;
  onVolumePointerCancel: () => void;
  onMuteToggle: () => void;
  onOutputSelectionChange: (selection: AudioOutputSelection) => void;
  onRefreshDevices: () => void;
}

export function PlaybackDock({
  playback,
  validatedFile,
  outputDevices,
  isLoadingDevices,
  isOutputSelectionPending,
  isTransportCommandPending,
  pendingTransportCommand,
  isScrubbing,
  positionDraft,
  isSeekPending,
  isAdjustingVolume,
  volumeDraft,
  isVolumePending,
  statusMessage,
  playbackError,
  deviceListError,
  onPlay,
  onPause,
  onResume,
  onStop,
  onSeek,
  onSeekCommit,
  onSeekCancel,
  onVolumeChange,
  onVolumePointerDown,
  onVolumeCommit,
  onVolumePointerCancel,
  onMuteToggle,
  onOutputSelectionChange,
  onRefreshDevices,
}: PlaybackDockProps) {
  const timed = playback.status === "playing" || playback.status === "paused";
  const duration = timed ? playback.durationMs : null;
  const position = timed ? playback.positionMs : 0;
  const selectedOutputDeviceId =
    playback.outputSelection.kind === "device" ? playback.outputSelection.deviceId : null;
  const primaryLabel =
    playback.status === "playing" ? "Pause" : playback.status === "paused" ? "Resume" : "Play";
  const primaryAction =
    playback.status === "playing" ? onPause : playback.status === "paused" ? onResume : onPlay;
  const primaryBusy =
    pendingTransportCommand === "start" ||
    pendingTransportCommand === "pause" ||
    pendingTransportCommand === "resume";
  const seekValue = Math.min(isScrubbing ? positionDraft : position, duration ?? 0);
  const displayedVolume = Math.min(
    100,
    Math.max(0, isAdjustingVolume ? volumeDraft : Math.round(playback.volume * 100)),
  );
  const outputDisabled =
    isLoadingDevices || isOutputSelectionPending || isTransportCommandPending || timed;

  return (
    <section
      className="playback-dock"
      aria-label="Playback controls"
      data-layout-boundary
      data-testid="playback-dock"
    >
      <div className="playback-dock__layout">
        <div className="playback-dock__identity" data-region="identity" aria-label="Current file">
          {validatedFile ? (
            <>
              <p
                className="playback-dock__filename font-interface text-body-md text-text-primary"
                title={validatedFile.fileName}
                aria-label={validatedFile.fileName}
              >
                {validatedFile.fileName}
              </p>
              <p className="mt-1 text-body-sm text-text-secondary">.{validatedFile.extension}</p>
            </>
          ) : (
            <p className="text-body-sm text-text-muted">No audio selected</p>
          )}
        </div>

        <div className="playback-dock__transport" data-region="transport">
          <ResponsiveCluster align="start">
            <button
              type="button"
              aria-label={primaryLabel}
              aria-busy={primaryBusy}
              disabled={validatedFile === null || isTransportCommandPending}
              onClick={primaryAction}
              className="playback-dock__fixed-control grid size-12 place-items-center rounded-full bg-text-primary text-canvas transition-opacity duration-150 ease-interface hover:opacity-85 disabled:cursor-not-allowed disabled:bg-surface-pressed disabled:text-text-disabled disabled:opacity-80"
            >
              <PlayPauseIcon playing={playback.status === "playing"} />
            </button>
            <button
              type="button"
              aria-label="Stop"
              disabled={!timed || isTransportCommandPending}
              onClick={onStop}
              className="playback-dock__fixed-control grid size-10 place-items-center rounded-full border border-border-control text-text-primary transition-opacity duration-150 ease-interface hover:opacity-80 disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-transparent disabled:text-text-disabled disabled:opacity-80"
            >
              <StopIcon />
            </button>
          </ResponsiveCluster>
        </div>

        <div className="playback-dock__timeline" data-region="timeline" aria-busy={isSeekPending}>
          <div className="flex justify-between text-body-sm text-text-secondary">
            <span className="tabular-nums">{formatPlaybackTime(seekValue)}</span>
            <span className="tabular-nums">
              {duration === null ? "--:--" : formatPlaybackTime(duration)}
            </span>
          </div>
          <input
            aria-label="Playback position"
            type="range"
            min={0}
            max={duration ?? 0}
            value={seekValue}
            disabled={!timed || duration === null || isSeekPending || isTransportCommandPending}
            onChange={(event) => onSeek(Number(event.currentTarget.value))}
            onPointerUp={(event) => onSeekCommit(Number(event.currentTarget.value))}
            onPointerCancel={onSeekCancel}
            onKeyUp={(event) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "PageUp",
                  "PageDown",
                  "Home",
                  "End",
                ].includes(event.key)
              ) {
                onSeekCommit(Number(event.currentTarget.value));
              }
            }}
            className="mt-2 w-full accent-text-primary disabled:accent-text-disabled"
          />
        </div>

        <div className="playback-dock__volume" data-region="volume" aria-busy={isVolumePending}>
          <span className="playback-dock__fixed-icon">
            <VolumeIcon muted={playback.muted} />
          </span>
          <input
            aria-label="Playback volume"
            aria-valuetext={`${displayedVolume} percent`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={displayedVolume}
            disabled={isVolumePending}
            onChange={(event) => onVolumeChange(Number(event.currentTarget.value))}
            onPointerDown={onVolumePointerDown}
            onPointerUp={(event) => onVolumeCommit(Number(event.currentTarget.value))}
            onPointerCancel={onVolumePointerCancel}
            onKeyUp={(event) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "PageUp",
                  "PageDown",
                  "Home",
                  "End",
                ].includes(event.key)
              ) {
                onVolumeCommit(Number(event.currentTarget.value));
              }
            }}
            className="accent-text-primary disabled:accent-text-disabled"
          />
          <span className="text-right text-body-sm text-text-secondary tabular-nums">
            {displayedVolume}%
          </span>
        </div>

        <div
          className="playback-dock__output"
          data-region="output"
          aria-busy={isOutputSelectionPending}
        >
          <span className="playback-dock__fixed-icon">
            <OutputDeviceIcon />
          </span>
          <select
            aria-label="Audio output device"
            value={
              playback.outputSelection.kind === "systemDefault"
                ? "systemDefault"
                : playback.outputSelection.deviceId
            }
            disabled={outputDisabled}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onOutputSelectionChange(
                value === "systemDefault"
                  ? { kind: "systemDefault" }
                  : { kind: "device", deviceId: value },
              );
            }}
            className="rounded-control border border-border-control bg-canvas px-2 py-2 text-body-sm text-text-primary disabled:border-border-subtle disabled:bg-transparent disabled:text-text-disabled"
          >
            <option value="systemDefault">System default</option>
            {selectedOutputDeviceId !== null &&
            !outputDevices?.some((device) => device.id === selectedOutputDeviceId) ? (
              <option value={selectedOutputDeviceId} disabled>
                Unavailable selected device
              </option>
            ) : null}
            {outputDevices?.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
                {device.isDefault ? " — Current default" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Refresh output devices"
            disabled={isLoadingDevices}
            onClick={onRefreshDevices}
            className="playback-dock__fixed-control grid size-10 place-items-center rounded-control border border-border-control text-text-primary disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-transparent disabled:text-text-disabled disabled:opacity-80"
          >
            <RefreshIcon />
          </button>
          <button
            type="button"
            aria-label={playback.muted ? "Unmute" : "Mute"}
            disabled={isVolumePending}
            onClick={onMuteToggle}
            className="playback-dock__fixed-control grid size-10 place-items-center rounded-control border border-border-control text-text-primary disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-transparent disabled:text-text-disabled disabled:opacity-80"
          >
            <VolumeIcon muted={playback.muted} />
          </button>
        </div>
      </div>
      <div className="playback-dock__status text-body-sm text-text-secondary" data-region="status">
        <div className="min-h-5" aria-live="polite">
          {statusMessage}
        </div>
        {playbackError ? (
          <p className="playback-dock__error mt-1 text-error" role="alert">
            {playbackError}
          </p>
        ) : null}
        {deviceListError ? (
          <p className="playback-dock__error mt-1 text-error" role="alert">
            {deviceListError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
