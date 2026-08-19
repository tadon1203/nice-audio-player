import type { PlaybackSnapshot } from "@/bindings";
import { useEffect, useState, type Ref } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { formatPlaybackTime } from "@/lib/playback-time";
import { effectsMotion } from "@/lib/motion";
import { AppIcon } from "./ui/AppIcon";
import { StateIcon } from "./ui/StateIcon";
import { IconButton } from "./ui/IconButton";
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
  activeContextMode?: "queue" | "lyrics" | null;
  onContextModeToggle?: (mode: "queue" | "lyrics") => void;
  queueButtonRef?: Ref<HTMLButtonElement>;
  lyricsButtonRef?: Ref<HTMLButtonElement>;
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
  activeContextMode = null,
  onContextModeToggle = () => undefined,
  queueButtonRef,
  lyricsButtonRef,
}: PlaybackDockProps) {
  const [artworkFailed, setArtworkFailed] = useState(false);
  const reducedMotion = useReducedMotion();
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
              <AnimatePresence initial={false}>
                {artworkUrl && !artworkFailed ? (
                  <motion.img
                    key={artworkUrl}
                    src={artworkUrl}
                    alt=""
                    className="playback-dock__artwork"
                    onError={() => setArtworkFailed(true)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: reducedMotion ? effectsMotion.reduced : effectsMotion.image,
                      ease: effectsMotion.ease,
                    }}
                  />
                ) : (
                  <motion.span
                    key="placeholder"
                    className="playback-dock__artwork-placeholder"
                    aria-hidden="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: reducedMotion ? effectsMotion.reduced : effectsMotion.image,
                      ease: effectsMotion.ease,
                    }}
                  />
                )}
              </AnimatePresence>
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
            <IconButton
              type="button"
              aria-label="Previous track"
              aria-busy={pendingTransportCommand === "previous"}
              disabled={!isPlaybackAvailable || !playback.canGoPrevious}
              onClick={onPrevious}
              className="playback-dock__fixed-control playback-dock__navigation-control"
            >
              <AppIcon name="previous" />
            </IconButton>
            <IconButton
              type="button"
              aria-label={primaryLabel}
              aria-busy={primaryBusy}
              disabled={
                !isPlaybackAvailable || (playback.status !== "playing" && !hasResumablePlayback)
              }
              onClick={primaryAction}
              className="playback-dock__fixed-control playback-dock__primary-control"
            >
              <StateIcon
                state={playback.status === "playing" ? "pause" : "play"}
                className="playback-dock__primary-icon"
              />
            </IconButton>
            <IconButton
              type="button"
              aria-label="Next track"
              aria-busy={pendingTransportCommand === "next"}
              disabled={!isPlaybackAvailable || !playback.canGoNext}
              onClick={onNext}
              className="playback-dock__fixed-control playback-dock__navigation-control"
            >
              <AppIcon name="next" />
            </IconButton>
          </div>
          <div
            className={`playback-dock__timeline${
              isSeekPending || isTransportCommandPending ? " is-pending" : ""
            }${!timed ? " is-idle" : ""}`}
          >
            {timed ? (
              <div className="flex justify-between text-body-sm text-text-secondary">
                <span className="tabular-nums">{formatPlaybackTime(seekValue)}</span>
                <span className="tabular-nums">
                  {duration === null ? "--:--" : formatPlaybackTime(duration)}
                </span>
              </div>
            ) : (
              <div aria-hidden="true" />
            )}
            <RangeControl
              aria-label="Playback position"
              aria-valuetext={`${formatPlaybackTime(seekValue)} of ${duration === null ? "--:--" : formatPlaybackTime(duration)}`}
              min={0}
              max={duration ?? 0}
              step={1}
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
          <div className="playback-dock__context-controls">
            <IconButton
              ref={queueButtonRef}
              type="button"
              className="playback-dock__context-button"
              selected={activeContextMode === "queue"}
              aria-label={activeContextMode === "queue" ? "Close queue" : "Open queue"}
              aria-expanded={activeContextMode === "queue"}
              aria-controls="playback-context-pane"
              onClick={() => onContextModeToggle("queue")}
            >
              <AppIcon name="queue" />
            </IconButton>
            <IconButton
              ref={lyricsButtonRef}
              type="button"
              className="playback-dock__context-button"
              selected={activeContextMode === "lyrics"}
              aria-label={activeContextMode === "lyrics" ? "Close lyrics" : "Open lyrics"}
              aria-expanded={activeContextMode === "lyrics"}
              aria-controls="playback-context-pane"
              onClick={() => onContextModeToggle("lyrics")}
            >
              <AppIcon name="lyrics" />
            </IconButton>
          </div>
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
