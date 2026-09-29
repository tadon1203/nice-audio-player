import { useRef } from "react";
import { m } from "motion/react";
import { usePlaybackItem, usePlaybackNavigation } from "@/renderer/entities/playback";
import { useTrackLyrics } from "@/renderer/entities/lyrics";
import {
  NOW_PLAYING_SLEEVE_ID,
  NOW_PLAYING_WAVEFORM_HEIGHT,
  PlaybackWaveformBand,
  SLEEVE_RADIUS_PX,
  useNowPlayingTransitions,
} from "@/renderer/features/now-playing-transition";
import { cn } from "@/renderer/shared/lib/utils";
import { KineticText } from "@/renderer/shared/ui/kinetic-text";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { ArtworkLight } from "@/renderer/shared/ui/artwork-light";
import { LyricsPanel } from "./lyrics-panel";

/**
 * Now Playing's content: the Sleeve continues its shared-element motion from the dock (the
 * same `layoutId`); the text is not shared — it fades in behind the Sleeve, since stretching
 * type between two sizes only distorts it. With lyrics the Sleeve and info sit left of the
 * lyrics panel; without them the same content is centred and large. The waveform grows along
 * the bottom edge when its data arrives.
 */
export function NowPlayingContent() {
  const item = usePlaybackItem();
  const transitions = useNowPlayingTransitions();
  const navigation = usePlaybackNavigation();
  // The title slides in per character on track changes, but not when Now Playing first opens.
  const openedOn = useRef(item?.queueItemId);
  const changedSinceOpen = item?.queueItemId !== openedOn.current;
  const { data: resolution } = useTrackLyrics(item?.trackId ?? null);
  // While lyrics are loading keep the layout the previous track had, so it does not flip twice.
  const showLyricsRef = useRef(true);
  if (resolution !== undefined) showLyricsRef.current = resolution.status === "resolved";
  const showLyrics = showLyricsRef.current;

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col">
      <ArtworkLight
        artwork={item?.artwork ?? null}
        strength="max"
        enter={navigation === "previous" ? "wipe-previous" : "wipe-next"}
      />
      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col",
          showLyrics ? "md:flex-row" : "items-center justify-center",
        )}
      >
        <div
          className={cn(
            "relative flex min-w-0 shrink-0 flex-col gap-4 p-6",
            showLyrics ? "md:w-96" : "items-center text-center md:max-w-2xl",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-4 md:flex-col",
              showLyrics ? "md:items-start" : "md:items-center",
            )}
          >
            <m.div
              layoutId={NOW_PLAYING_SLEEVE_ID}
              className="size-16 shrink-0 overflow-hidden md:size-[22rem]"
              style={{ borderRadius: SLEEVE_RADIUS_PX }}
            >
              <Artwork
                artwork={item?.artwork ?? null}
                alt={item === null ? "" : `${item.title} artwork`}
                loading="eager"
                className="size-full rounded-none"
              />
            </m.div>
            <m.div
              key={item?.queueItemId ?? "none"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: transitions.content }}
              className="min-w-0"
            >
              <p className="line-clamp-3 text-2xl font-semibold text-foreground md:text-4xl">
                {item !== null && changedSinceOpen ? (
                  <KineticText text={item.title} direction={navigation === "previous" ? -1 : 1} />
                ) : (
                  (item?.title ?? "Nothing playing")
                )}
              </p>
              {/* Ink-1: the playing track is "the present" per DESIGN.md, and Light may be absent. */}
              <p className="mt-2 truncate text-base text-foreground">{item?.artist}</p>
              <p className="truncate text-sm text-foreground">{item?.album}</p>
            </m.div>
          </div>
          {showLyrics ? null : (
            <LyricsPanel
              trackId={item?.trackId ?? null}
              className="h-auto items-center text-center"
            />
          )}
        </div>
        {showLyrics ? (
          <m.div
            key={item?.trackId ?? "none"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: transitions.content }}
            className="min-h-0 min-w-0 flex-1 p-6 pt-0 md:pt-6"
          >
            <LyricsPanel trackId={item?.trackId ?? null} className="h-full" />
          </m.div>
        ) : null}
      </div>
      <PlaybackWaveformBand
        height={NOW_PLAYING_WAVEFORM_HEIGHT}
        className="relative shrink-0 border-t border-border/50 px-6 py-4"
        timeClassName="text-sm"
      />
    </div>
  );
}
