import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, m, type Variants } from "motion/react";
import { ChevronDown } from "lucide-react";
import { toNameSegment } from "@/renderer/entities/library";
import { usePlaybackNavigation, usePlaybackTransport } from "@/renderer/entities/playback";
import {
  NOW_PLAYING_SLEEVE_ID,
  SLEEVE_RADIUS_PX,
  useNowPlaying,
} from "@/renderer/features/now-playing-transition";
import type { PlaybackItem } from "@/shared/ipc";
import { cn } from "@/renderer/shared/lib/utils";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { ContextMenu, ContextMenuTrigger, MenuContent, MenuItem } from "@/renderer/shared/ui/menu";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/renderer/shared/ui/shadcn/tooltip";

/** Sliding distance for the artwork, title and artist. One value so they travel together. */
const SLIDE_PX = 16;

/** Next enters from the right and pushes the old track out to the left; previous mirrors it. */
const slide: Variants = {
  enter: (direction: 1 | -1) => ({ x: direction * SLIDE_PX, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: 1 | -1) => ({ x: -direction * SLIDE_PX, opacity: 0 }),
};

function useSlide() {
  const direction = usePlaybackNavigation() === "previous" ? -1 : 1;
  const transition = useMotionTransition("mediumMove");
  return { direction, transition } as const;
}

/** The artwork sleeve and, beside it, the title and artist (or the last command error). */
export function DockIdentity({ item, trackKey }: { item: PlaybackItem | null; trackKey: string }) {
  const { commandError } = usePlaybackTransport();
  const { isOpen: nowPlayingOpen, toggle: toggleNowPlaying } = useNowPlaying();
  const { direction, transition } = useSlide();
  const [errorTooltipOpen, setErrorTooltipOpen] = useState(false);
  const title = item?.title ?? "Nothing playing";

  return (
    <div className="col-start-1 flex min-w-0 items-center gap-3" data-region="playback-identity">
      <Sleeve item={item} trackKey={trackKey} />
      {nowPlayingOpen ? null : (
        <div className="relative flex min-w-0 flex-col justify-center gap-0.5">
          {/* Title and artist are one keyed block, so they leave and arrive as one piece. */}
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <m.div
              key={trackKey}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={transition}
              className="flex min-w-0 flex-col justify-center gap-0.5"
            >
              <button
                type="button"
                disabled={item === null}
                onClick={toggleNowPlaying}
                title={title}
                className="block max-w-full cursor-pointer truncate rounded-sm text-left text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
              >
                {title}
              </button>
              {commandError ? (
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
            </m.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function Sleeve({ item, trackKey }: { item: PlaybackItem | null; trackKey: string }) {
  const navigate = useNavigate();
  const { isOpen: nowPlayingOpen, toggle } = useNowPlaying();
  const { direction, transition } = useSlide();
  const hasTrack = item !== null;
  const albumKey = item?.albumKey ?? null;
  const artistName =
    albumKey?.albumArtist || item?.albumArtist?.trim() || item?.artist?.trim() || "";

  // Now Playing has its own big Sleeve (the shared-element target). While it is open this slot
  // holds the close affordance instead, so the dock's layout does not shift.
  if (nowPlayingOpen) {
    return (
      <Button
        type="button"
        variant="ghost"
        aria-label="Close Now Playing"
        onClick={toggle}
        data-slot="sleeve-close"
        className="size-16 shrink-0"
      >
        <ChevronDown aria-hidden="true" className="size-6" />
      </Button>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <button
            type="button"
            aria-label="Open Now Playing"
            disabled={!hasTrack}
            onClick={toggle}
            data-slot="sleeve"
            className={cn(
              // Inset, not edge-filling: a rounded tile that sits inside the identity column
              // like any other artwork placed in the workspace, rather than the dock's own
              // square edge treatment.
              "block aspect-square size-16 shrink-0 cursor-pointer overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
            )}
          />
        }
      >
        <m.div
          layoutId={NOW_PLAYING_SLEEVE_ID}
          className="relative size-full overflow-hidden"
          style={{ borderRadius: SLEEVE_RADIUS_PX }}
        >
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <m.div
              key={trackKey}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={transition}
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
          {albumKey !== null ? (
            <MenuItem
              onClick={() =>
                void navigate({
                  to: "/library/albums/$albumArtist/$albumTitle",
                  params: {
                    albumArtist: toNameSegment(albumKey.albumArtist),
                    albumTitle: toNameSegment(albumKey.title),
                  },
                })
              }
            >
              Go to album
            </MenuItem>
          ) : null}
          {artistName !== "" ? (
            <MenuItem
              onClick={() =>
                void navigate({
                  to: "/library/album-artists/$artistName",
                  params: { artistName: toNameSegment(artistName) },
                })
              }
            >
              Go to artist
            </MenuItem>
          ) : null}
        </MenuContent>
      ) : null}
    </ContextMenu>
  );
}
