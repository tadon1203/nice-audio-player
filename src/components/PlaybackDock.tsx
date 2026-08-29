import type { PlaybackSnapshot } from "@/bindings";
import { useEffect, useState, type Ref } from "react";
import { AppIcon } from "./ui/AppIcon";
import { StateIcon } from "./ui/StateIcon";
import { Button } from "./ui/button";
import { PlaybackTimeline } from "./PlaybackTimeline";
import { VolumeControl } from "./VolumeControl";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

type PendingTransportCommand = "stop" | "pause" | "resume" | "previous" | "next" | null;

interface PlaybackDockProps {
  playback: PlaybackSnapshot;
  track: {
    title: string;
    artist: string | null;
    artworkUrl: string | null;
    artworkLoading: boolean;
  };
  transport: {
    available: boolean;
    pending: boolean;
    pendingCommand: PendingTransportCommand;
    hasResumablePlayback: boolean;
    play(): void;
    pause(): void;
    resume(): void;
    previous(): void;
    next(): void;
  };
  seek: {
    previewMs: number | null;
    pending: boolean;
    change(value: number): void;
    commit(value: number): void;
    cancel(): void;
  };
  volume: {
    value: number;
    updatePending: boolean;
    mutePending: boolean;
    change(value: number): void;
    commit(value: number): void;
    cancel(): void;
    toggleMute(): void;
  };
  context: {
    mode: "queue" | "lyrics" | null;
    toggle(mode: "queue" | "lyrics"): void;
    queueButtonRef?: Ref<HTMLButtonElement>;
    lyricsButtonRef?: Ref<HTMLButtonElement>;
  };
  error: string | null;
}

export function PlaybackDock({
  playback,
  track,
  transport,
  seek,
  volume,
  context: { mode: contextMode, toggle: toggleContext, queueButtonRef, lyricsButtonRef },
  error,
}: PlaybackDockProps) {
  const [artworkFailed, setArtworkFailed] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setArtworkFailed(false));
  }, [track.artworkUrl]);
  const timed = playback.status === "playing" || playback.status === "paused";
  const duration = timed ? playback.durationMs : null;
  const position = timed ? playback.positionMs : 0;
  const primaryLabel =
    playback.status === "playing" ? "Pause" : playback.status === "paused" ? "Resume" : "Play";
  const primaryAction =
    playback.status === "playing"
      ? transport.pause
      : playback.status === "paused"
        ? transport.resume
        : transport.play;
  const primaryBusy = transport.pendingCommand === "pause" || transport.pendingCommand === "resume";
  const seekValue = Math.min(seek.previewMs ?? position, duration ?? 0);
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
            <div className="playback-dock__artwork-frame" aria-busy={track.artworkLoading}>
              {track.artworkUrl && !artworkFailed ? (
                <img
                  key={track.artworkUrl}
                  src={track.artworkUrl}
                  alt=""
                  className="playback-dock__artwork"
                  onError={() => setArtworkFailed(true)}
                />
              ) : (
                <span
                  key="placeholder"
                  className="playback-dock__artwork-placeholder"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="playback-dock__identity-copy">
              <p className="playback-dock__title" title={track.title}>
                {track.title}
              </p>
              <p className="playback-dock__artist">{track.artist ?? " "}</p>
            </div>
          </div>
        </div>
        <div
          className="playback-dock__playback-core"
          data-region="playback-core"
          aria-busy={seek.pending}
        >
          <div className="playback-dock__transport">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon"
                    type="button"
                    aria-label="Previous track"
                    aria-busy={transport.pendingCommand === "previous"}
                    disabled={!transport.available || !playback.canGoPrevious}
                    onClick={transport.previous}
                    className="playback-dock__fixed-control playback-dock__navigation-control"
                  />
                }
              >
                <AppIcon name="previous" />
              </TooltipTrigger>
              <TooltipContent>Previous track</TooltipContent>
            </Tooltip>
            <Button
              size="icon-lg"
              type="button"
              aria-label={primaryLabel}
              aria-busy={primaryBusy}
              disabled={
                !transport.available ||
                (playback.status !== "playing" && !transport.hasResumablePlayback)
              }
              onClick={primaryAction}
              className="playback-dock__fixed-control playback-dock__primary-control"
            >
              <StateIcon
                state={playback.status === "playing" ? "pause" : "play"}
                className="playback-dock__primary-icon"
              />
            </Button>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon"
                    type="button"
                    aria-label="Next track"
                    aria-busy={transport.pendingCommand === "next"}
                    disabled={!transport.available || !playback.canGoNext}
                    onClick={transport.next}
                    className="playback-dock__fixed-control playback-dock__navigation-control"
                  />
                }
              >
                <AppIcon name="next" />
              </TooltipTrigger>
              <TooltipContent>Next track</TooltipContent>
            </Tooltip>
          </div>
          <PlaybackTimeline
            duration={duration}
            value={seekValue}
            available={transport.available}
            pending={seek.pending}
            transportPending={transport.pending}
            onChange={seek.change}
            onCommit={seek.commit}
            onCancel={seek.cancel}
          />
        </div>
        <div className="playback-dock__secondary">
          <div className="playback-dock__context-controls">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon"
                    ref={queueButtonRef}
                    type="button"
                    className="playback-dock__context-button"
                    aria-pressed={contextMode === "queue"}
                    aria-label={contextMode === "queue" ? "Close queue" : "Open queue"}
                    aria-expanded={contextMode === "queue"}
                    aria-controls="playback-context-pane"
                    onClick={() => toggleContext("queue")}
                  />
                }
              >
                <AppIcon name="queue" />
              </TooltipTrigger>
              <TooltipContent>
                {contextMode === "queue" ? "Close queue" : "Open queue"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon"
                    ref={lyricsButtonRef}
                    type="button"
                    className="playback-dock__context-button"
                    aria-pressed={contextMode === "lyrics"}
                    aria-label={contextMode === "lyrics" ? "Close lyrics" : "Open lyrics"}
                    aria-expanded={contextMode === "lyrics"}
                    aria-controls="playback-context-pane"
                    onClick={() => toggleContext("lyrics")}
                  />
                }
              >
                <AppIcon name="lyrics" />
              </TooltipTrigger>
              <TooltipContent>
                {contextMode === "lyrics" ? "Close lyrics" : "Open lyrics"}
              </TooltipContent>
            </Tooltip>
          </div>
          <VolumeControl
            playback={playback}
            value={volume.value}
            isPlaybackAvailable={transport.available}
            isVolumeUpdatePending={volume.updatePending}
            isMutePending={volume.mutePending}
            onValueChange={volume.change}
            onValueCommitted={volume.commit}
            onInteractionCancel={volume.cancel}
            onVolumeButtonPress={volume.toggleMute}
          />
        </div>
      </div>
      {error ? (
        <div className="playback-dock__status text-body-sm" data-region="status">
          <p className="playback-dock__error text-error" role="alert">
            {error}
          </p>
        </div>
      ) : null}
    </section>
  );
}
