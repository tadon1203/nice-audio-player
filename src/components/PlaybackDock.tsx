import type { PlaybackSnapshot, ValidatedAudioFile } from "@/bindings";
import { useEffect, useState } from "react";
import { formatPlaybackTime } from "@/lib/playback-time";
import { PlayPauseIcon, VolumeIcon } from "./icons";
import { ResponsiveCluster } from "./layout/ResponsiveCluster";

type PendingTransportCommand = "start" | "stop" | "pause" | "resume" | null;

interface PlaybackDockProps {
  playback: PlaybackSnapshot;
  validatedFile: ValidatedAudioFile | null;
  isPlaybackAvailable: boolean;
  isTransportCommandPending: boolean;
  pendingTransportCommand: PendingTransportCommand;
  seekPreviewMs: number | null;
  isSeekPending: boolean;
  volumeValue: number;
  isVolumePending: boolean;
  isVolumeSliderDisabled: boolean;
  playbackError: string | null;
  presentationTitle: string;
  presentationArtist: string | null;
  artworkUrl: string | null;
  artworkLoading: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onSeek: (value: number) => void;
  onSeekCommit: (value: number) => void;
  onSeekCancel: () => void;
  onVolumeChange: (value: number) => void;
  onVolumePointerDown: () => void;
  onVolumeCommit: (value: number) => void;
  onVolumePointerCancel: () => void;
  onMuteToggle: () => void;
}

export function PlaybackDock({
  playback,
  validatedFile,
  isPlaybackAvailable,
  isTransportCommandPending,
  pendingTransportCommand,
  seekPreviewMs,
  isSeekPending,
  volumeValue,
  isVolumePending,
  isVolumeSliderDisabled,
  playbackError,
  presentationTitle,
  presentationArtist,
  artworkUrl,
  artworkLoading,
  onPlay,
  onPause,
  onResume,
  onSeek,
  onSeekCommit,
  onSeekCancel,
  onVolumeChange,
  onVolumePointerDown,
  onVolumeCommit,
  onVolumePointerCancel,
  onMuteToggle,
}: PlaybackDockProps) {
  const [artworkFailed, setArtworkFailed] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setArtworkFailed(false));
  }, [artworkUrl]);
  const timed = playback.status === "playing" || playback.status === "paused";
  const duration = timed ? playback.durationMs : null;
  const position = timed ? playback.positionMs : 0;
  const primaryLabel =
    playback.status === "playing" ? "Pause" : playback.status === "paused" ? "Resume" : "Play";
  const primaryAction =
    playback.status === "playing" ? onPause : playback.status === "paused" ? onResume : onPlay;
  const primaryBusy =
    pendingTransportCommand === "start" ||
    pendingTransportCommand === "pause" ||
    pendingTransportCommand === "resume";
  const seekValue = Math.min(seekPreviewMs ?? position, duration ?? 0);
  const rangeKeys = [
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "Home",
    "End",
  ];
  return (
    <section
      className="playback-dock"
      aria-label="Playback controls"
      data-layout-boundary
      data-testid="playback-dock"
    >
      <div className="playback-dock__layout">
        <div className="playback-dock__identity" data-region="identity" aria-label="Current track">
          <div className="playback-dock__identity-content">
            <div className="playback-dock__artwork-frame" aria-busy={artworkLoading}>
              {artworkUrl && !artworkFailed ? (
                <img
                  src={artworkUrl}
                  alt=""
                  className="playback-dock__artwork"
                  onError={() => setArtworkFailed(true)}
                />
              ) : (
                <span className="playback-dock__artwork-placeholder" aria-hidden="true" />
              )}
            </div>
            <div className="playback-dock__identity-copy">
              <p className="playback-dock__title" title={presentationTitle}>
                {presentationTitle}
              </p>
              <p className="playback-dock__artist">{presentationArtist ?? " "}</p>
            </div>
          </div>
        </div>
        <div
          className="playback-dock__playback-core"
          data-region="playback-core"
          aria-busy={isSeekPending}
        >
          <ResponsiveCluster align="center" className="playback-dock__transport">
            <button
              type="button"
              aria-label={primaryLabel}
              aria-busy={primaryBusy}
              disabled={validatedFile === null || !isPlaybackAvailable}
              onClick={primaryAction}
              className="playback-dock__fixed-control playback-dock__primary-control grid place-items-center rounded-full bg-text-primary text-canvas transition-opacity duration-150 ease-interface hover:opacity-85 disabled:cursor-not-allowed disabled:bg-surface-pressed disabled:text-text-disabled disabled:opacity-80"
            >
              <PlayPauseIcon
                playing={playback.status === "playing"}
                className="playback-dock__primary-icon"
              />
            </button>
          </ResponsiveCluster>
          <div className="playback-dock__timeline">
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
              disabled={
                !isPlaybackAvailable ||
                !timed ||
                duration === null ||
                isSeekPending ||
                isTransportCommandPending
              }
              onChange={(event) => onSeek(Number(event.currentTarget.value))}
              onPointerUp={(event) => onSeekCommit(Number(event.currentTarget.value))}
              onPointerCancel={onSeekCancel}
              onKeyUp={(event) => {
                if (rangeKeys.includes(event.key)) onSeekCommit(Number(event.currentTarget.value));
              }}
              className="w-full accent-text-primary disabled:accent-text-disabled"
            />
          </div>
        </div>
        <div className="playback-dock__volume" data-region="volume" aria-busy={isVolumePending}>
          <button
            type="button"
            aria-label={playback.muted ? "Unmute" : "Mute"}
            disabled={!isPlaybackAvailable || isVolumePending}
            onClick={onMuteToggle}
            className="playback-dock__fixed-control grid size-10 place-items-center rounded-control border border-border-control text-text-primary disabled:cursor-not-allowed disabled:border-border-subtle disabled:text-text-disabled"
          >
            <VolumeIcon muted={playback.muted} className="playback-dock__volume-icon" />
          </button>
          <input
            aria-label="Playback volume"
            aria-valuetext={`${volumeValue} percent`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={volumeValue}
            disabled={!isPlaybackAvailable || isVolumeSliderDisabled}
            onChange={(event) => onVolumeChange(Number(event.currentTarget.value))}
            onPointerDown={onVolumePointerDown}
            onPointerUp={(event) => onVolumeCommit(Number(event.currentTarget.value))}
            onPointerCancel={onVolumePointerCancel}
            onKeyUp={(event) => {
              if (rangeKeys.includes(event.key)) onVolumeCommit(Number(event.currentTarget.value));
            }}
            className="accent-text-primary disabled:accent-text-disabled"
          />
        </div>
      </div>
      {playbackError ? (
        <div className="playback-dock__status text-body-sm" data-region="status">
          <p className="playback-dock__error text-error" role="alert">
            {playbackError}
          </p>
        </div>
      ) : null}
    </section>
  );
}
