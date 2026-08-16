import type { PlaybackSnapshot } from "@/bindings";
import { useEffect, useState } from "react";
import { formatPlaybackTime } from "@/lib/playback-time";
import { motionDurationSeconds } from "@/lib/motion";
import { PlayPauseIcon, SkipTrackIcon } from "./icons";
import { RangeControl } from "./RangeControl";
import { VolumeControl } from "./VolumeControl";

type PendingTransportCommand = "stop" | "pause" | "resume" | "previous" | "next" | null;

interface PlaybackDockProps {
  playback: PlaybackSnapshot;
  hasResumablePlayback?: boolean;
  isPlaybackAvailable: boolean;
  isTransportCommandPending: boolean;
  pendingTransportCommand: PendingTransportCommand;
  seekPreviewMs: number | null;
  isSeekPending: boolean;
  volumeValue: number;
  isVolumeUpdatePending: boolean;
  isMutePending: boolean;
  playbackError: string | null;
  presentationTitle: string;
  presentationArtist: string | null;
  artworkUrl: string | null;
  artworkLoading: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onSeek: (value: number) => void;
  onSeekCommit: (value: number) => void;
  onSeekCancel: () => void;
  onVolumeChange: (value: number) => void;
  onVolumeInteractionStart: () => void;
  onVolumeCommit: (value: number) => void;
  onVolumePointerCancel: () => void;
  onVolumeButtonPress: () => void;
  isQueueOpen?: boolean;
  onQueueToggle?: () => void;
}

export function PlaybackDock({
  playback,
  hasResumablePlayback,
  isPlaybackAvailable,
  isTransportCommandPending,
  pendingTransportCommand,
  seekPreviewMs,
  isSeekPending,
  volumeValue,
  isVolumeUpdatePending,
  isMutePending,
  playbackError,
  presentationTitle,
  presentationArtist,
  artworkUrl,
  artworkLoading,
  onPlay,
  onPause,
  onResume,
  onPrevious = () => {},
  onNext = () => {},
  onSeek,
  onSeekCommit,
  onSeekCancel,
  onVolumeChange,
  onVolumeInteractionStart,
  onVolumeCommit,
  onVolumePointerCancel,
  onVolumeButtonPress,
  isQueueOpen = false,
  onQueueToggle = () => undefined,
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
  const primaryBusy = pendingTransportCommand === "pause" || pendingTransportCommand === "resume";
  const seekValue = Math.min(seekPreviewMs ?? position, duration ?? 0);
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
          <div className="playback-dock__transport">
            <button
              type="button"
              aria-label="Previous track"
              aria-busy={pendingTransportCommand === "previous"}
              disabled={!isPlaybackAvailable || !playback.canGoPrevious}
              onClick={onPrevious}
              className="playback-dock__fixed-control playback-dock__navigation-control"
            >
              <SkipTrackIcon direction="previous" />
            </button>
            <button
              type="button"
              aria-label={primaryLabel}
              aria-busy={primaryBusy}
              disabled={
                !isPlaybackAvailable || (playback.status !== "playing" && !hasResumablePlayback)
              }
              onClick={primaryAction}
              className="playback-dock__fixed-control playback-dock__primary-control grid place-items-center rounded-full bg-text-primary text-canvas hover:opacity-85 disabled:cursor-not-allowed disabled:bg-surface-pressed disabled:text-text-disabled disabled:opacity-80"
            >
              <PlayPauseIcon
                playing={playback.status === "playing"}
                className="playback-dock__primary-icon"
              />
            </button>
            <button
              type="button"
              aria-label="Next track"
              aria-busy={pendingTransportCommand === "next"}
              disabled={!isPlaybackAvailable || !playback.canGoNext}
              onClick={onNext}
              className="playback-dock__fixed-control playback-dock__navigation-control"
            >
              <SkipTrackIcon direction="next" />
            </button>
          </div>
          <div
            className={`playback-dock__timeline${
              isSeekPending || isTransportCommandPending ? " is-pending" : ""
            }`}
          >
            <div className="flex justify-between text-body-sm text-text-secondary">
              <span className="tabular-nums">{formatPlaybackTime(seekValue)}</span>
              <span className="tabular-nums">
                {duration === null ? "--:--" : formatPlaybackTime(duration)}
              </span>
            </div>
            <RangeControl
              aria-label="Playback position"
              aria-valuetext={`${formatPlaybackTime(seekValue)} of ${duration === null ? "--:--" : formatPlaybackTime(duration)}`}
              min={0}
              max={duration ?? 0}
              step={1}
              positionTransitionDuration={motionDurationSeconds.content}
              value={seekValue}
              disabled={
                !isPlaybackAvailable ||
                !timed ||
                duration === null ||
                isSeekPending ||
                isTransportCommandPending
              }
              onValueChange={onSeek}
              onValueCommit={onSeekCommit}
              onInteractionCancel={onSeekCancel}
            />
          </div>
        </div>
        <div className="playback-dock__secondary">
          <VolumeControl
            playback={playback}
            value={volumeValue}
            isPlaybackAvailable={isPlaybackAvailable}
            isVolumeUpdatePending={isVolumeUpdatePending}
            isMutePending={isMutePending}
            onValueChange={onVolumeChange}
            onInteractionStart={onVolumeInteractionStart}
            onValueCommit={onVolumeCommit}
            onInteractionCancel={onVolumePointerCancel}
            onVolumeButtonPress={onVolumeButtonPress}
          />
          <button
            type="button"
            className="playback-dock__volume-button playback-dock__queue-button"
            aria-label={isQueueOpen ? "Close queue" : "Open queue"}
            aria-expanded={isQueueOpen}
            aria-controls="playback-queue"
            onClick={onQueueToggle}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M5 6h14M5 12h14M5 18h9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
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
