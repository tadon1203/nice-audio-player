import type { ReactNode } from "react";
import { useState } from "react";
import { AnimatePresence, m, useTransform } from "motion/react";
import { Repeat, Shuffle, SkipBack, SkipForward } from "lucide-react";
import {
  nextRepeatMode,
  usePlaybackClock,
  usePlaybackDuration,
  usePlaybackActions,
  usePlaybackQueue,
  usePlaybackTransport,
} from "@/renderer/entities/playback";
import { cn } from "@/renderer/shared/lib/utils";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
import { PlayPauseIcon } from "@/renderer/shared/ui/play-pause-icon";
import { Button } from "@/renderer/shared/ui/shadcn/button";

/** Shuffle, previous, play/pause, next, repeat. */
export function DockTransport() {
  const transport = usePlaybackTransport();
  const { repeatMode, shuffleEnabled } = usePlaybackQueue();
  const playback = usePlaybackActions();
  const active = transport.active;
  const playing = transport.status === "playing";
  const controlsBusy = transport.pending !== null;

  return (
    <div
      className="col-start-2 flex min-w-0 items-center justify-self-center gap-1 lg:gap-2"
      data-region="playback-core"
      role="group"
      aria-label="Transport controls"
    >
      <ToggleButton
        label="Shuffle"
        pressed={shuffleEnabled}
        disabled={transport.connection !== "ready"}
        onClick={() => void playback.setShuffle(!shuffleEnabled)}
        className="max-md:hidden"
      >
        <Shuffle aria-hidden="true" />
      </ToggleButton>
      <TransportButton
        label="Previous track"
        disabled={!transport.canGoPrevious || controlsBusy}
        onClick={() => {
          void playback.previous();
        }}
      >
        <SkipBack aria-hidden="true" />
      </TransportButton>
      <TransportButton
        label={playing ? "Pause" : active ? "Resume" : "Play"}
        disabled={!active || controlsBusy}
        onClick={() => void (playing ? playback.pause() : playback.resume())}
        variant="default"
        spring
        className="relative rounded-full disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100"
      >
        <PlayPauseIcon playing={playing} />
        {active ? <PlayProgressRing /> : null}
      </TransportButton>
      <TransportButton
        label="Next track"
        disabled={!transport.canGoNext || controlsBusy}
        onClick={() => {
          void playback.next();
        }}
      >
        <SkipForward aria-hidden="true" />
      </TransportButton>
      <ToggleButton
        label={`Repeat: ${repeatMode}`}
        pressed={repeatMode !== "off"}
        disabled={transport.connection !== "ready"}
        onClick={() => void playback.setRepeatMode(nextRepeatMode(repeatMode))}
        className="max-md:hidden"
      >
        <RepeatIcon mode={repeatMode} />
      </ToggleButton>
    </div>
  );
}

/** One turn of the icon per mode change; `one` drops a superscript 1 beside it. */
function RepeatIcon({ mode }: { mode: string }) {
  const transition = useMotionTransition("mediumMove");
  const [state, setState] = useState({ mode, turns: 0 });
  if (state.mode !== mode) setState({ mode, turns: state.turns + 1 });
  return (
    <>
      <m.span animate={{ rotate: state.turns * 360 }} transition={transition} className="flex">
        <Repeat aria-hidden="true" />
      </m.span>
      <AnimatePresence>
        {mode === "one" ? (
          <m.span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 text-sm leading-none"
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          >
            ¹
          </m.span>
        ) : null}
      </AnimatePresence>
    </>
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

/**
 * A ring around the play button that fills clockwise with the track's progress, in the artwork
 * colour. It is a time Strip bent into a circle, not a control's state. It is the only part of
 * the transport that reads the position each frame, so the dock does not re-render with time.
 */
function PlayProgressRing() {
  const durationMs = usePlaybackDuration();
  const position = usePlaybackClock();
  const dashOffset = useTransform(position, (p) =>
    durationMs !== null && durationMs > 0 ? 1 - Math.min(1, Math.max(0, p / durationMs)) : 1,
  );
  return (
    <svg
      aria-hidden="true"
      data-slot="play-progress-ring"
      viewBox="0 0 42 42"
      className="pointer-events-none absolute -inset-[3px] size-[calc(100%+6px)] -rotate-90 fill-none stroke-(--artwork-accent) forced-colors:stroke-[CanvasText]"
    >
      <m.circle
        cx="21"
        cy="21"
        r="20"
        strokeWidth="2"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1 1"
        style={{ strokeDashoffset: dashOffset }}
      />
    </svg>
  );
}

function TransportButton({
  label,
  children,
  disabled,
  onClick,
  variant = "ghost",
  spring = false,
  className,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  variant?: "default" | "ghost";
  /** The play button's press: a spring that overshoots slightly (the `press` token). */
  spring?: boolean;
  className?: string;
}) {
  const press = useMotionTransition("press");
  return (
    <Button
      {...(spring
        ? {
            render: <m.button whileTap={{ scale: 0.94 }} transition={press} />,
          }
        : {})}
      type="button"
      size="icon-lg"
      variant={variant}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(spring && "transition-colors active:scale-100", className)}
    >
      {children}
    </Button>
  );
}
