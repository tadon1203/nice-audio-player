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
      className="grid min-h-[136px] w-full grid-rows-[minmax(104px,auto)_auto] border-t border-border-subtle bg-surface py-2 [container-type:inline-size] [container-name:playback-dock]"
      aria-label="Playback controls"
      data-layout-boundary
      data-testid="playback-dock"
    >
      <div
        data-slot="playback-layout"
        className="grid min-h-[104px] w-full min-w-0 grid-cols-[minmax(var(--dock-side-min),1.2fr)_minmax(var(--dock-core-min),1.6fr)_minmax(var(--dock-side-min),1.2fr)] items-stretch px-[clamp(40px,3vw,40px)] [--dock-core-max:704px] [--dock-core-min:208px] [--dock-side-min:288px] [--dock-volume-width:192px] @max-[56rem]/playback-dock:[--dock-side-min:192px] @max-[42rem]/playback-dock:[--dock-core-min:176px]"
      >
        <div
          data-region="playback-identity"
          aria-label="Current track"
          className="flex h-full w-full min-w-0 items-center gap-6 self-center justify-self-start"
        >
          <div
            className="grid h-20 w-20 flex-none place-items-center overflow-hidden rounded-control bg-surface-raised"
            data-slot="playback-artwork-frame"
            aria-busy={track.artworkLoading}
          >
            {track.artworkUrl && !artworkFailed ? (
              <img
                key={track.artworkUrl}
                src={track.artworkUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setArtworkFailed(true)}
              />
            ) : (
              <span
                key="placeholder"
                className="h-full w-full rounded-[inherit] border border-border-subtle bg-surface-raised"
                aria-hidden="true"
              />
            )}
          </div>
          <div className="grid min-w-0 flex-1 gap-1">
            <p
              className="overflow-hidden text-ellipsis whitespace-nowrap text-body-lg text-text-primary"
              title={track.title}
            >
              {track.title}
            </p>
            <p className="min-h-[1.38em] overflow-hidden text-ellipsis whitespace-nowrap text-body-sm text-text-secondary">
              {track.artist ?? " "}
            </p>
          </div>
        </div>
        <div
          className="flex h-full w-full min-w-0 max-w-[704px] flex-col items-center justify-center justify-self-center"
          data-region="playback-core"
          aria-busy={seek.pending}
        >
          <div
            data-slot="playback-transport"
            className="flex min-w-0 flex-none items-center justify-center gap-2"
          >
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="icon-primary"
                    type="button"
                    aria-label="Previous track"
                    aria-busy={transport.pendingCommand === "previous"}
                    disabled={!transport.available || !playback.canGoPrevious}
                    onClick={transport.previous}
                  />
                }
              >
                <AppIcon name="previous" />
              </TooltipTrigger>
              <TooltipContent>Previous track</TooltipContent>
            </Tooltip>
            <Button
              variant="transport"
              type="button"
              aria-label={primaryLabel}
              aria-busy={primaryBusy}
              disabled={
                !transport.available ||
                (playback.status !== "playing" && !transport.hasResumablePlayback)
              }
              onClick={primaryAction}
            >
              <StateIcon state={playback.status === "playing" ? "pause" : "play"} />
            </Button>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="icon-primary"
                    type="button"
                    aria-label="Next track"
                    aria-busy={transport.pendingCommand === "next"}
                    disabled={!transport.available || !playback.canGoNext}
                    onClick={transport.next}
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
        <div className="grid w-[var(--dock-side-min)] min-w-0 grid-cols-1 grid-rows-[44px_44px] items-center justify-self-end justify-items-stretch gap-0 @min-[56.01rem]/playback-dock:grid-cols-[88px_192px] @min-[56.01rem]/playback-dock:grid-rows-1 @min-[56.01rem]/playback-dock:gap-2">
          <div className="flex min-w-0 items-center justify-end gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="icon"
                    ref={queueButtonRef}
                    type="button"
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
                    variant="icon"
                    ref={lyricsButtonRef}
                    type="button"
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
        <div
          className="mt-3 min-h-5 w-full px-[clamp(40px,3vw,40px)] text-body-sm"
          data-region="status"
        >
          <p className="max-w-[70ch] overflow-wrap-anywhere text-error" role="alert">
            {error}
          </p>
        </div>
      ) : null}
    </section>
  );
}
