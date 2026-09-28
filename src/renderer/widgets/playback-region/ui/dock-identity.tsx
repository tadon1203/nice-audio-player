import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, m } from "motion/react";
import { ChevronDown } from "lucide-react";
import { toNameSegment } from "@/renderer/entities/library";
import { usePlaybackTransport } from "@/renderer/entities/playback";
import type { PlaybackItem } from "@/shared/ipc";
import { cn } from "@/renderer/shared/lib/utils";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { ContextMenu, ContextMenuTrigger, MenuContent, MenuItem } from "@/renderer/shared/ui/menu";
import type { useMotionTransition } from "@/renderer/shared/ui/motion";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/renderer/shared/ui/shadcn/tooltip";

type TrackChangeTransition = ReturnType<typeof useMotionTransition>;

/** The artwork sleeve and, beside it, the title and artist (or the last command error). */
export function DockIdentity({
  item,
  nowPlayingOpen,
  onToggleNowPlaying,
  trackKey,
  direction,
  trackChangeTransition,
}: {
  item: PlaybackItem | null;
  nowPlayingOpen: boolean;
  onToggleNowPlaying: () => void;
  trackKey: string;
  direction: 1 | -1;
  trackChangeTransition: TrackChangeTransition;
}) {
  const { commandError } = usePlaybackTransport();
  const [errorTooltipOpen, setErrorTooltipOpen] = useState(false);
  const title = item?.title ?? "Nothing playing";

  return (
    <div className="col-start-1 flex min-w-0 items-center gap-3" data-region="playback-identity">
      <Sleeve
        item={item}
        nowPlayingOpen={nowPlayingOpen}
        onToggle={onToggleNowPlaying}
        trackKey={trackKey}
        direction={direction}
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
              initial={{ x: direction * 16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction * -16, opacity: 0 }}
              transition={trackChangeTransition}
            >
              <button
                type="button"
                disabled={item === null}
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

        {nowPlayingOpen ? null : commandError ? (
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
              {commandError}
            </TooltipTrigger>
            <TooltipContent>{commandError}</TooltipContent>
          </Tooltip>
        ) : item?.artist ? (
          <span className="block truncate text-sm text-muted-foreground" title={item.artist}>
            {item.artist}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Sleeve({
  item,
  nowPlayingOpen,
  onToggle,
  trackKey,
  direction,
  trackChangeTransition,
  className,
}: {
  item: PlaybackItem | null;
  nowPlayingOpen: boolean;
  onToggle: () => void;
  trackKey: string;
  direction: 1 | -1;
  trackChangeTransition: TrackChangeTransition;
  className?: string;
}) {
  const navigate = useNavigate();
  const hasTrack = item !== null;
  const albumTitle = item?.album?.trim() ?? "";
  const albumArtist = item?.albumArtist?.trim() || item?.artist?.trim() || "";

  // Now Playing has its own big Sleeve (the shared-element target); the dock doesn't keep a
  // slot here while it's open. That frees the full width for the waveform below (its close
  // affordance lives in the identity block instead).
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
                artwork={item?.artwork ?? null}
                alt={item === null ? "" : `${item.title} artwork`}
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
                params: {
                  albumArtist: toNameSegment(albumArtist),
                  albumTitle: toNameSegment(albumTitle),
                },
              })
            }
          >
            Go to album
          </MenuItem>
          <MenuItem
            onClick={() =>
              void navigate({
                to: "/library/album-artists/$artistName",
                params: { artistName: toNameSegment(albumArtist) },
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
