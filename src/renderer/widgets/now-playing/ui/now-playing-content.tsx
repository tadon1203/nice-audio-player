import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { m } from "motion/react";
import { toNameSegment } from "@/renderer/entities/library";
import {
  usePlaybackItem,
  usePlaybackNavigation,
  usePlaybackQueue,
  usePlaybackSignalPath,
} from "@/renderer/entities/playback";
import { useTrackLyrics } from "@/renderer/entities/lyrics";
import {
  NOW_PLAYING_SLEEVE_ID,
  PlaybackWaveformBand,
  SLEEVE_RADIUS_PX,
  useNowPlayingTransitions,
} from "@/renderer/features/now-playing-transition";
import type { PlaybackItem } from "@/shared/ipc";
import { cn } from "@/renderer/shared/lib/utils";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { FactLine } from "@/renderer/shared/ui/fact-line";
import { KineticText } from "@/renderer/shared/ui/kinetic-text";
import { LyricsPanel } from "./lyrics-panel";
import { NowPlayingLight } from "./now-playing-light";

/**
 * The Sleeve's size follows the shape of the window instead of a fixed rem: with lyrics it is
 * the column width or what is left of the height after the info block, whichever is smaller;
 * without them it takes up to 60% of the height. Container units resolve against the layer.
 */
const SLEEVE_SIZE_WITH_LYRICS =
  "max(10rem, min(calc(100cqh - 25rem), calc(clamp(18rem, 34cqw, 28rem) - 3rem)))";
const SLEEVE_SIZE_ALONE = "max(10rem, min(60cqh, 40cqw, 32rem))";

/** The waveform band's height for the room the layer has: it gives way to the content. */
function waveformHeightFor(layerHeightPx: number): number {
  if (layerHeightPx >= 640) return 96;
  if (layerHeightPx >= 480) return 72;
  return 56;
}

function useLayerHeight() {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(720);
  useEffect(() => {
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref: setElement, height };
}

/**
 * Now Playing's content. The Sleeve continues its shared-element motion from the dock (the same
 * `layoutId`); the text is not shared, it fades in behind the Sleeve, since stretching type
 * between two sizes only distorts it. Three kinds of thing: to look at (the Sleeve), to read
 * (the lyrics), to operate (the waveform), with the info beside them. With lyrics the Sleeve
 * and info sit left of the panel; without them they sit side by side, centred, as the subject.
 * Below `md` everything stacks. The waveform grows along the bottom edge when its data arrives.
 */
export function NowPlayingContent() {
  const item = usePlaybackItem();
  const { ref, height } = useLayerHeight();
  const { data: resolution } = useTrackLyrics(item?.trackId ?? null);
  // While lyrics are loading keep the layout the previous track had, so it does not flip twice.
  // (They are also fetched ahead of time, so this is rarely visible.)
  const [showLyrics, setShowLyrics] = useState(true);
  if (resolution !== undefined && (resolution.status === "resolved") !== showLyrics) {
    setShowLyrics(resolution.status === "resolved");
  }

  return (
    <div ref={ref} className="relative flex h-full min-h-0 min-w-0 flex-col [container-type:size]">
      <NowPlayingLight />
      {showLyrics ? (
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col md:grid md:grid-cols-[minmax(16rem,clamp(18rem,34cqw,28rem))_minmax(0,1fr)]">
          <div className="flex min-h-0 min-w-0 flex-col gap-4 p-6 md:justify-between md:pr-2">
            <Identity item={item} sleeveSize={SLEEVE_SIZE_WITH_LYRICS} />
            <UpNext className="max-md:hidden [@container(max-height:640px)]:hidden" />
          </div>
          <LyricsColumn trackId={item?.trackId ?? null} />
        </div>
      ) : (
        <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center p-6 md:gap-10">
          <div className="flex min-w-0 max-w-full flex-col gap-4 md:max-w-4xl md:flex-row md:items-center md:gap-10">
            <Identity
              item={item}
              sleeveSize={SLEEVE_SIZE_ALONE}
              alone
              lyricsHint={<LyricsHint item={item} status={resolution?.status ?? null} />}
            />
          </div>
          <UpNext className="absolute right-6 bottom-4 max-md:hidden [@container(max-height:640px)]:hidden" />
        </div>
      )}
      <PlaybackWaveformBand
        height={waveformHeightFor(height)}
        timeLayout="inline"
        className="relative shrink-0 border-t border-border/50 px-6 py-4"
        timeClassName="text-sm"
      />
    </div>
  );
}

function LyricsColumn({ trackId }: { trackId: string | null }) {
  const transitions = useNowPlayingTransitions();
  return (
    <m.div
      key={trackId ?? "none"}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: transitions.content }}
      className="min-h-0 min-w-0 flex-1 p-6 pt-0 md:pt-6"
    >
      {/* Lines stay short (about 32 characters) however wide the window is. */}
      <LyricsPanel trackId={trackId} className="h-full max-w-[32ch] min-w-[min(100%,24rem)]" />
    </m.div>
  );
}

/** The Sleeve with the title, artist, album and facts. `alone` is the lyric-less, larger form. */
function Identity({
  item,
  sleeveSize,
  alone = false,
  lyricsHint,
}: {
  item: PlaybackItem | null;
  sleeveSize: string;
  alone?: boolean;
  lyricsHint?: React.ReactNode;
}) {
  const transitions = useNowPlayingTransitions();
  const navigation = usePlaybackNavigation();
  // The title slides in per character on track changes, but not when Now Playing first opens.
  const [openedOn] = useState(item?.queueItemId);
  const changedSinceOpen = item?.queueItemId !== openedOn;

  return (
    <div
      className={cn(
        "flex min-w-0 gap-4 max-md:items-center",
        alone ? "md:flex-row md:items-center md:gap-10" : "md:flex-col",
      )}
    >
      <div
        className="relative size-16 shrink-0 md:size-(--np-sleeve)"
        style={{ "--np-sleeve": sleeveSize } as React.CSSProperties}
      >
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
        <p
          className={cn(
            "font-semibold text-foreground",
            alone ? "line-clamp-3 text-2xl md:text-4xl" : "line-clamp-2 text-2xl md:text-3xl",
          )}
        >
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
        <Facts item={item} />
        {lyricsHint}
      </m.div>
    </div>
  );
}

const linkClass =
  "rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring";

/** Artist and album, each a link to its page (following one closes Now Playing). */
function TrackLinks({ item }: { item: PlaybackItem | null }) {
  if (item === null) return null;
  const album = item.album?.trim() ?? "";
  const artist = item.artist?.trim() ?? "";
  // The catalog's own key, so the link cannot drift from how the library groups albums.
  const albumArtist = item.albumKey?.albumArtist || item.albumArtist?.trim() || artist;
  return (
    <>
      {artist !== "" ? (
        <p className="truncate text-base text-foreground">
          {albumArtist !== "" ? (
            <Link
              to="/library/album-artists/$artistName"
              params={{ artistName: toNameSegment(albumArtist) }}
              className={linkClass}
            >
              {artist}
            </Link>
          ) : (
            artist
          )}
        </p>
      ) : null}
      {album !== "" ? (
        <p className="truncate text-sm text-foreground">
          {item.albumKey !== null ? (
            <Link
              to="/library/albums/$albumArtist/$albumTitle"
              params={{
                albumArtist: toNameSegment(item.albumKey.albumArtist),
                albumTitle: toNameSegment(item.albumKey.title),
              }}
              className={linkClass}
            >
              {album}
            </Link>
          ) : (
            album
          )}
        </p>
      ) : null}
    </>
  );
}

/** `2019  Disc 2  Track 4  FLAC 24/96`: what the library knows, and what is really decoded. */
function Facts({ item }: { item: PlaybackItem | null }) {
  const path = usePlaybackSignalPath();
  if (item === null) return null;
  return (
    <FactLine
      facts={[
        item.year,
        item.discNumber !== null && item.discNumber > 1 ? `Disc ${item.discNumber}` : null,
        item.trackNumber !== null
          ? item.albumTrackCount !== null && item.albumTrackCount >= item.trackNumber
            ? `Track ${item.trackNumber} of ${item.albumTrackCount}`
            : `Track ${item.trackNumber}`
          : null,
        path?.source,
      ]}
      className="mt-1"
    />
  );
}

/** Why there are no lyrics, in one line beside the track rather than over the whole screen. */
function LyricsHint({
  item,
  status,
}: {
  item: PlaybackItem | null;
  status: "notFound" | "sourceFailed" | "resolved" | null;
}) {
  if (item === null || status === null || status === "resolved") return null;
  if (status === "notFound") {
    return <p className="mt-3 text-sm text-muted-foreground">No lyrics for this track</p>;
  }
  const expected = item.file.path.replace(/\.[^.\\/]+$/, ".lrc");
  return (
    <p className="mt-3 min-w-0 text-sm text-muted-foreground">
      Couldn&apos;t read the lyrics file.{" "}
      <button
        type="button"
        title={`${expected} (click to copy)`}
        onClick={() => void navigator.clipboard?.writeText(expected).catch(() => undefined)}
        className={cn("block max-w-full cursor-pointer truncate text-left", linkClass)}
      >
        {expected}
      </button>
    </p>
  );
}

/** The next track, at the bottom of the column, close to the time axis it will follow. */
function UpNext({ className }: { className?: string }) {
  const { queue } = usePlaybackQueue();
  const next = queue?.upcoming[0];
  if (next === undefined) return null;
  return (
    <div className={cn("flex min-w-0 items-center gap-3 text-sm", className)}>
      <span className="shrink-0 text-muted-foreground">Up next</span>
      <Artwork artwork={next.artwork} className="size-8 shrink-0 rounded-sm" />
      <span className="min-w-0 truncate text-foreground">
        {next.title}
        {next.artist ? <span className="text-muted-foreground"> — {next.artist}</span> : null}
      </span>
    </div>
  );
}
