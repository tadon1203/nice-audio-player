import { useState } from "react";
import { m } from "motion/react";
import { usePlaybackNavigation } from "@/entities/playback";
import {
  NOW_PLAYING_SLEEVE_ID,
  SLEEVE_RADIUS_PX,
  useNowPlayingTransitions,
} from "@/features/now-playing-transition";
import type { LyricsResolution, PlaybackItem } from "@/shared/ipc";
import { Artwork } from "@/shared/ui/artwork";
import { KineticText } from "@/shared/ui/kinetic-text";
import { Facts, TrackLinks } from "./track-facts";

/** The Sleeve with the title, artist, album and facts, stacked (side by side below `md`). */
export function Identity({
  item,
  resolution,
}: {
  item: PlaybackItem | null;
  resolution: LyricsResolution | null;
}) {
  const transitions = useNowPlayingTransitions();
  const navigation = usePlaybackNavigation();
  // The title wipes in on track changes, but not when Now Playing first opens.
  const [openedOn] = useState(item?.queueItemId);
  const changedSinceOpen = item?.queueItemId !== openedOn;

  return (
    <div className="flex min-w-0 gap-4 max-md:items-center md:flex-col">
      <div className="relative size-16 shrink-0 md:size-(--np-sleeve)">
        <m.div
          layoutId={NOW_PLAYING_SLEEVE_ID}
          className="relative size-full overflow-hidden"
          style={{ borderRadius: SLEEVE_RADIUS_PX }}
        >
          <Artwork
            artwork={item?.artwork ?? null}
            alt={item === null ? "" : `${item.title} artwork`}
            loading="eager"
            className="size-full rounded-none"
          />
        </m.div>
      </div>
      <m.div
        key={item?.queueItemId ?? "none"}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: transitions.content }}
        className="flex min-w-0 flex-col gap-1"
      >
        {/* Always two lines tall, so the lines below never move when the title wraps differently. */}
        <p className="line-clamp-2 min-h-[2lh] text-2xl font-semibold text-foreground md:text-3xl lg:text-4xl">
          {item !== null && changedSinceOpen ? (
            <KineticText
              key={item.queueItemId}
              text={item.title}
              direction={navigation === "previous" ? -1 : 1}
            />
          ) : (
            (item?.title ?? "Nothing playing")
          )}
        </p>
        {/* Ink-1: the playing track is "the present" per DESIGN.md, and Light may be absent. */}
        <TrackLinks item={item} />
        <Facts item={item} resolution={resolution} />
      </m.div>
    </div>
  );
}
