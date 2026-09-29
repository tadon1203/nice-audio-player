import type { ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react";
import {
  nextRepeatMode,
  usePlaybackActions,
  usePlaybackQueue,
  usePlaybackTransport,
} from "@/renderer/entities/playback";
import { cn } from "@/renderer/shared/lib/utils";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
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
        className="rounded-full disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100"
      >
        <PlayPauseIcon playing={playing} />
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
        {repeatMode === "one" ? <Repeat1 aria-hidden="true" /> : <Repeat aria-hidden="true" />}
      </ToggleButton>
    </div>
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

/** The two glyphs swap with a quick scale-and-fade instead of flipping. */
function PlayPauseIcon({ playing }: { playing: boolean }) {
  const transition = useMotionTransition("feedback");
  const Icon = playing ? Pause : Play;
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.span
        key={playing ? "pause" : "play"}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.6, opacity: 0 }}
        transition={transition}
        className="flex"
      >
        <Icon aria-hidden="true" fill="currentColor" />
      </m.span>
    </AnimatePresence>
  );
}

function TransportButton({
  label,
  children,
  disabled,
  onClick,
  variant = "ghost",
  className,
}: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  variant?: "default" | "ghost";
  className?: string;
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
      className={className}
    >
      {children}
    </Button>
  );
}
