import { useEffect, useRef } from "react";
import {
  animate,
  m,
  useIsPresent,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useAlbumTracks } from "@/renderer/entities/library";
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
import { motionTokens } from "@/renderer/shared/ui/motion";
import { LyricsPanel } from "./lyrics-panel";
import { RecordDisc } from "./record-disc/record-disc";

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
            showLyrics ? "md:w-[28rem]" : "items-center text-center md:max-w-2xl",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-4 md:flex-col",
              showLyrics ? "md:items-start" : "md:items-center",
            )}
          >
            {/* The disc waits behind the Sleeve, the same size, and rolls out of its right side. */}
            <div
              className={cn(
                "relative size-16 shrink-0",
                showLyrics ? "md:size-72" : "md:size-[22rem]",
              )}
            >
              <DiscSlot showLyrics={showLyrics} />
              <m.div
                layoutId={NOW_PLAYING_SLEEVE_ID}
                className="relative z-10 size-full overflow-hidden"
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

/** How far the disc slides out from behind the Sleeve, as a share of its own width. */
const DISC_OUT = { lyrics: 45, centred: 50 } as const;

/**
 * The record disc, rolling out from behind the Sleeve once the Sleeve has landed and back in
 * as Now Playing closes (a little quicker). Its turning while it rolls is the distance over
 * its radius, so it looks like it rolls rather than slides. Under reduced motion it stays out
 * and only fades. Not shown below `md`.
 */
function DiscSlot({ showLyrics }: { showLyrics: boolean }) {
  const item = usePlaybackItem();
  const present = useIsPresent();
  const reduced = useReducedMotion() === true;
  const out = showLyrics ? DISC_OUT.lyrics : DISC_OUT.centred;
  const slide = useMotionValue(0);
  useEffect(() => {
    const controls = animate(
      slide,
      present ? 1 : 0,
      reduced
        ? motionTokens.feedback
        : present
          ? { ...motionTokens.mediumMove, delay: motionTokens.largeMove.visualDuration }
          : {
              ...motionTokens.mediumMove,
              visualDuration: motionTokens.mediumMove.visualDuration * 0.7,
            },
    );
    return () => controls.stop();
  }, [present, reduced, slide]);
  const x = useTransform(slide, (v) => `${(reduced ? 1 : v) * out}%`);
  // Rolled distance / radius, in degrees: (share of the diameter) * 2 radians.
  const roll = useTransform(slide, (v) => ((v * out) / 100) * 2 * (180 / Math.PI));

  // The track number is looked up in the album's track list (the playing item has none).
  const tracks = useAlbumTracks({
    title: item?.album ?? "",
    albumArtist: item?.albumArtist ?? item?.artist ?? "",
  });
  const trackNumber = tracks.items.find((t) => t.id === item?.trackId)?.trackNumber ?? null;

  return (
    <m.div className="absolute inset-0 max-md:hidden" style={{ x, opacity: reduced ? slide : 1 }}>
      <RecordDisc trackNumber={trackNumber} roll={roll} className="size-full" />
    </m.div>
  );
}
