import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, m } from "motion/react";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
import {
  ChevronDown,
  List,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  isActivePlayback,
  nextRepeatMode,
  usePlaybackSession,
  formatVolumeDb,
  stepVolumeDb,
} from "@/renderer/features/playback-control";
import { useQueuePanel } from "@/renderer/widgets/queue-panel";
import { cn } from "@/renderer/shared/lib/utils";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { ArtworkLight } from "@/renderer/shared/ui/artwork-light";
import { ContextMenu, ContextMenuTrigger, MenuContent, MenuItem } from "@/renderer/shared/ui/menu";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { Slider } from "@/renderer/shared/ui/shadcn/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/renderer/shared/ui/shadcn/tooltip";
import { DOCK_SEEK_HEIGHT, PlaybackWaveformBand } from "./playback-waveform-band";

export function PlaybackDock({
  nowPlayingOpen,
  onToggleNowPlaying,
}: {
  nowPlayingOpen: boolean;
  onToggleNowPlaying: () => void;
}) {
  const playback = usePlaybackSession();
  const { toggle: toggleQueue } = useQueuePanel();
  const active = isActivePlayback(playback.snapshot);
  const playing = playback.snapshot?.status === "playing";
  const title = playback.title ?? "Nothing playing";
  const [errorTooltipOpen, setErrorTooltipOpen] = useState(false);
  const volumeDb = formatVolumeDb(playback.volume, playback.muted);
  const controlsBusy = playback.transportPending !== null;
  const trackKey = playback.snapshot?.file?.path ?? "none";
  const trackChangeTransition = useMotionTransition("mediumMove");
  const nowPlayingTransition = useMotionTransition("largeMove");
  // Next exits to the left, previous exits to the right; anything else (a fresh track from the
  // library, auto-advance) defaults to "forward". Read at render time by the Sleeve/identity
  // block, which re-render when the new snapshot for `trackKey` arrives.
  const directionRef = useRef<1 | -1>(1);
  const goPrevious = () => {
    directionRef.current = -1;
    void playback.previous();
  };
  const goNext = () => {
    directionRef.current = 1;
    void playback.next();
  };

  return (
    <footer
      className="relative isolate h-full min-h-0 bg-sidebar shadow-[inset_0_1px_0_var(--border)]"
      aria-label="Playback controls"
      data-slot="playback-dock"
    >
      <ArtworkLight
        artwork={playback.artwork}
        strength="strong"
        className="mask-[linear-gradient(to_right,black,transparent_85%)]"
      />
      {/*
       * A real vertical stack, not an overlay: the progress row and the transport grid each
       * consume their own height, so they can never overlap. `justify-end` anchors the transport
       * grid to a fixed distance from the dock's bottom edge (via `pb-3`) so it — and every
       * control in it — never moves, in either state; only the progress row's own height above
       * it changes. Both rows span the dock's full width — the progress line runs edge to edge,
       * and the transport grid's two `minmax(0,1fr)` side columns are equal, so the center column
       * (transport) lands on the dock's true horizontal center regardless of how wide the
       * identity block or volume controls are.
       */}
      <div className="relative flex h-full min-h-0 min-w-0 flex-col justify-end pb-3">
        {/*
         * While Now Playing is open the progress row has nothing to show (the waveform moved up
         * there instead), so its slot animates shut instead of sitting there as dead space above
         * the transport row. The transport row below is unaffected: it keeps a fixed `min-h-16`
         * (the Sleeve's height) regardless of whether the Sleeve is mounted, and `justify-end`
         * pins it to the same spot from the bottom either way — the shared-element band itself
         * still only ever mounts on one side at a time (see `PlaybackWaveformBand`).
         */}
        <m.div
          layout
          transition={nowPlayingTransition}
          className={cn("shrink-0 overflow-hidden", nowPlayingOpen ? "h-0" : "mb-3 h-3")}
        >
          {nowPlayingOpen ? null : (
            <PlaybackWaveformBand
              height={DOCK_SEEK_HEIGHT}
              showWaveform={false}
              timeLayout="inline"
              className="px-2 md:px-4 lg:px-6"
              timeClassName="hidden md:inline"
            />
          )}
        </m.div>

        {/*
         * A single row: identity, transport, and volume are all centered against the same fixed
         * track height, so the Sleeve's 64px lines up with the transport and volume icons instead
         * of drifting when the identity column happens to need more height than they do (or less,
         * once the Sleeve unmounts for Now Playing).
         */}
        <div
          className="grid min-h-16 min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 px-2 md:px-4 lg:gap-x-6 lg:px-6"
          data-region="playback-main"
        >
          <div
            className="col-start-1 flex min-w-0 items-center gap-3"
            data-region="playback-identity"
          >
            <Sleeve
              playback={playback}
              nowPlayingOpen={nowPlayingOpen}
              onToggle={onToggleNowPlaying}
              trackKey={trackKey}
              direction={directionRef.current}
              trackChangeTransition={trackChangeTransition}
            />
            <div className="flex min-w-0 flex-col justify-center gap-0.5">
              {nowPlayingOpen ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Close Now Playing"
                  onClick={onToggleNowPlaying}
                  className="-ml-2"
                >
                  <ChevronDown aria-hidden="true" data-icon="inline-start" />
                  Close
                </Button>
              ) : (
                <AnimatePresence mode="wait" initial={false}>
                  <m.div
                    key={trackKey}
                    initial={{ x: directionRef.current * 16, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: directionRef.current * -16, opacity: 0 }}
                    transition={trackChangeTransition}
                  >
                    <button
                      type="button"
                      disabled={playback.title === null}
                      onClick={onToggleNowPlaying}
                      title={title}
                      className="block max-w-full cursor-pointer truncate rounded-sm text-left text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                    >
                      <m.span layoutId="now-playing-title" className="block truncate">
                        {title}
                      </m.span>
                    </button>
                  </m.div>
                </AnimatePresence>
              )}

              {nowPlayingOpen ? null : playback.commandError ? (
                <Tooltip open={errorTooltipOpen} onOpenChange={setErrorTooltipOpen}>
                  <TooltipTrigger
                    render={
                      <span
                        className="block truncate text-sm text-destructive"
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
                  className="block truncate text-sm text-muted-foreground"
                  title={playback.artist}
                >
                  {playback.artist}
                </span>
              ) : null}
            </div>
          </div>

          <div
            className="col-start-2 flex min-w-0 items-center justify-self-center gap-1 lg:gap-2"
            data-region="playback-core"
            role="group"
            aria-label="Transport controls"
          >
            <ToggleButton
              label="Shuffle"
              pressed={playback.shuffleEnabled}
              disabled={playback.connection !== "ready"}
              onClick={() => void playback.setShuffle(!playback.shuffleEnabled)}
              className="max-md:hidden"
            >
              <Shuffle aria-hidden="true" />
            </ToggleButton>
            <TransportButton
              label="Previous track"
              disabled={!playback.snapshot?.canGoPrevious || controlsBusy}
              onClick={goPrevious}
            >
              <SkipBack aria-hidden="true" />
            </TransportButton>
            <TransportButton
              label={playing ? "Pause" : active ? "Resume" : "Play"}
              disabled={!active || controlsBusy}
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
              disabled={!playback.snapshot?.canGoNext || controlsBusy}
              onClick={goNext}
            >
              <SkipForward aria-hidden="true" />
            </TransportButton>
            <ToggleButton
              label={`Repeat: ${playback.repeatMode}`}
              pressed={playback.repeatMode !== "off"}
              disabled={playback.connection !== "ready"}
              onClick={() => void playback.setRepeatMode(nextRepeatMode(playback.repeatMode))}
              className="max-md:hidden"
            >
              {playback.repeatMode === "one" ? (
                <Repeat1 aria-hidden="true" />
              ) : (
                <Repeat aria-hidden="true" />
              )}
            </ToggleButton>
          </div>

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
              disabled={!active}
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
              aria-label={playback.muted ? "Unmute" : "Mute"}
              disabled={playback.mutePending || playback.connection !== "ready"}
              onClick={() => void playback.toggleMute()}
            >
              {playback.muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            </Button>
            <div
              className="w-24 shrink-0 sm:w-28"
              data-region="volume-slider"
              onWheel={(event) => {
                if (playback.connection !== "ready" || event.deltaY === 0) return;
                playback.setVolume(stepVolumeDb(playback.volume, event.deltaY < 0 ? 1 : -1));
                if (playback.muted && !playback.mutePending) void playback.toggleMute();
              }}
            >
              <VolumeSlider
                value={playback.volume}
                valueText={
                  playback.muted ? "Muted" : `${Math.round(playback.volume * 100)} percent`
                }
                disabled={playback.connection !== "ready"}
                onInput={(value) => {
                  playback.setVolume(value);
                  if (playback.muted && !playback.mutePending) void playback.toggleMute();
                }}
              />
            </div>
            <span
              className="hidden min-w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground lg:inline"
              data-region="volume-readout"
            >
              {volumeDb}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function Sleeve({
  playback,
  nowPlayingOpen,
  onToggle,
  trackKey,
  direction,
  trackChangeTransition,
  className,
}: {
  playback: ReturnType<typeof usePlaybackSession>;
  nowPlayingOpen: boolean;
  onToggle: () => void;
  trackKey: string;
  direction: 1 | -1;
  trackChangeTransition: ReturnType<typeof useMotionTransition>;
  className?: string;
}) {
  const navigate = useNavigate();
  const track = playback.currentTrack;
  const hasTrack = playback.title !== null;
  const albumTitle = track?.album?.trim() || "Unknown album";
  const albumArtist = track?.albumArtist?.trim() || track?.artist?.trim() || "Unknown artist";

  // Now Playing has its own big Sleeve (the shared-element target); the dock doesn't keep a
  // slot here while it's open. That frees the full width for the waveform below (its close
  // affordance lives in the transport row instead — see `data-region="playback-identity"`).
  if (nowPlayingOpen) return null;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <button
            type="button"
            aria-label="Open Now Playing"
            disabled={!hasTrack}
            onClick={onToggle}
            data-slot="sleeve"
            className={cn(
              // Inset, not edge-filling: a rounded tile that sits inside the identity column
              // like any other artwork placed in the workspace, rather than the dock's own
              // square edge treatment.
              "block aspect-square size-16 shrink-0 cursor-pointer overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
              className,
            )}
          />
        }
      >
        <m.div layoutId="now-playing-sleeve" className="size-full overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={trackKey}
              initial={{ x: direction * 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction * -24, opacity: 0 }}
              transition={trackChangeTransition}
              className="size-full"
            >
              <Artwork
                artwork={playback.artwork}
                alt={playback.title === null ? "" : `${playback.title} artwork`}
                loading="eager"
                className="size-full rounded-lg"
              />
            </m.div>
          </AnimatePresence>
        </m.div>
      </ContextMenuTrigger>
      {hasTrack ? (
        <MenuContent side="right" align="start" className="min-w-40">
          <MenuItem
            onClick={() =>
              void navigate({
                to: "/library/albums/$albumArtist/$albumTitle",
                params: { albumArtist, albumTitle },
              })
            }
          >
            Go to album
          </MenuItem>
          <MenuItem
            onClick={() =>
              void navigate({
                to: "/library/album-artists/$artistName",
                params: { artistName: albumArtist },
              })
            }
          >
            Go to artist
          </MenuItem>
        </MenuContent>
      ) : null}
    </ContextMenu>
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

/** On/off is the icon plus a dot beneath it, never color alone. */
function ToggleButton({
  label,
  pressed,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon-lg"
      variant="ghost"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("relative", pressed ? "text-foreground" : "text-muted-foreground", className)}
    >
      {children}
      <span
        aria-hidden="true"
        data-slot="toggle-dot"
        className={cn(
          "absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current",
          !pressed && "invisible",
        )}
      />
    </Button>
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
  children: ReactNode;
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
