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
import { useQueuePanelStore } from "@/renderer/widgets/queue-panel";
import {
  NOW_PLAYING_SLEEVE_ID,
  PlaybackWaveformBand,
  SLEEVE_RADIUS_PX,
  useNowPlayingTransitions,
} from "@/renderer/features/now-playing-transition";
import type { LyricsResolution, PlaybackItem } from "@/shared/ipc";
import { cn } from "@/renderer/shared/lib/utils";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { FactLine } from "@/renderer/shared/ui/fact-line";
import { KineticText } from "@/renderer/shared/ui/kinetic-text";
import { LyricsPanel } from "./lyrics-panel";
import { NowPlayingLight } from "./now-playing-light";
import { QueueColumn } from "./queue-column";

/**
 * One Sleeve size for every state. Container units resolve against the grid area (the layer
 * without the waveform band): its height minus the outer padding (4rem), the gap between the
 * Sleeve and the info (1rem) and the info block (~10rem), and never more than 38% of the width.
 */
const SLEEVE_SIZE = "max(10rem, min(calc(100cqh - 15rem), 38cqw, 40rem))";

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
 * Now Playing's content: one skeleton in every state. Left, the Sleeve and the track's info;
 * right, what this playback is doing now: its lyrics, or else the queue in the order it plays,
 * the current line or track always 40% from the top. Beside lyrics, from 90rem, a rail of the
 * upcoming tracks; below that the next track sits at the end of the waveform band instead (never
 * both, and never beside a queue that already shows it). The Sleeve continues its shared-element
 * motion from the dock (the same `layoutId`); the text is not shared, it fades in behind the
 * Sleeve. Below `md` everything stacks. The waveform grows along the bottom edge when its data
 * arrives.
 */
export function NowPlayingContent() {
  const item = usePlaybackItem();
  const { ref, height } = useLayerHeight();
  const { data: resolution } = useTrackLyrics(item?.trackId ?? null);
  // While lyrics are loading keep the column the previous track had, so it does not flip twice
  // (they are also fetched ahead of time). The first ever render starts from what is cached.
  const [showLyrics, setShowLyrics] = useState(resolution?.status === "resolved");
  if (resolution !== undefined && (resolution.status === "resolved") !== showLyrics) {
    setShowLyrics(resolution.status === "resolved");
  }

  return (
    <div ref={ref} className="@container/npw relative flex h-full min-h-0 min-w-0 flex-col">
      <NowPlayingLight />
      {/* The size container: the layer without the waveform band, and without padding. */}
      <div className="relative min-h-0 min-w-0 flex-1 [container-name:np] [container-type:size]">
        <div
          className={cn(
            "flex h-full min-h-0 min-w-0 flex-col md:grid md:grid-rows-[minmax(0,1fr)] md:gap-12 md:p-8",
            showLyrics
              ? "md:grid-cols-[var(--np-sleeve)_minmax(0,1fr)] @min-[90rem]/npw:grid-cols-[var(--np-sleeve)_minmax(0,1fr)_20rem]"
              : "md:grid-cols-[var(--np-sleeve)_minmax(0,1fr)]",
          )}
          style={{ "--np-sleeve": SLEEVE_SIZE } as React.CSSProperties}
        >
          <div className="flex min-h-0 min-w-0 flex-col gap-4 p-6 md:w-(--np-sleeve) md:p-0">
            <Identity item={item} resolution={resolution ?? null} />
          </div>
          <RightColumn item={item} showLyrics={showLyrics} />
          {showLyrics ? (
            <QueueColumn variant="rail" className="hidden @min-[90rem]/npw:flex" />
          ) : null}
        </div>
      </div>
      <PlaybackWaveformBand
        height={waveformHeightFor(height)}
        timeLayout="inline"
        className="relative shrink-0 border-t border-border/50 px-6 py-4"
        timeClassName="text-sm"
        trailing={showLyrics ? <UpNext className="@min-[90rem]/npw:hidden" /> : null}
      />
    </div>
  );
}

function RightColumn({ item, showLyrics }: { item: PlaybackItem | null; showLyrics: boolean }) {
  const transitions = useNowPlayingTransitions();
  return (
    <m.div
      key={`${showLyrics ? "lyrics" : "queue"}:${item?.trackId ?? "none"}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: transitions.content }}
      // An inline-size container: the text is sized from this column's width (`cqi`).
      className="min-h-0 min-w-0 flex-1 p-6 pt-0 [container-type:inline-size] md:p-0"
    >
      {showLyrics ? (
        <LyricsPanel trackId={item?.trackId ?? null} className="h-full" />
      ) : (
        <QueueColumn variant="full" />
      )}
    </m.div>
  );
}

/** The Sleeve with the title, artist, album and facts, stacked (side by side below `md`). */
function Identity({
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
        <p className="truncate text-sm text-foreground [@container(max-height:520px)]:hidden">
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

/** `2019  Disc 2  Track 4  FLAC 24/96  No lyrics`: what the library knows, what is really decoded, and the lyrics' state. */
function Facts({
  item,
  resolution,
}: {
  item: PlaybackItem | null;
  resolution: LyricsResolution | null;
}) {
  const path = usePlaybackSignalPath();
  if (item === null) return null;
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-4 text-sm text-muted-foreground">
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
      />
      <LyricsState item={item} resolution={resolution} />
    </div>
  );
}

/** Why the right column shows no timed lyrics, in the Facts line rather than the column. */
function LyricsState({
  item,
  resolution,
}: {
  item: PlaybackItem;
  resolution: LyricsResolution | null;
}) {
  if (resolution === null) return null;
  if (resolution.status === "notFound") return <span>No lyrics</span>;
  if (resolution.status === "sourceFailed") {
    const expected = item.file.path.replace(/\.[^.\\/]+$/, ".lrc");
    return (
      <button
        type="button"
        title={`${expected} (click to copy)`}
        onClick={() => void navigator.clipboard?.writeText(expected).catch(() => undefined)}
        className={cn("cursor-pointer", linkClass)}
      >
        Lyrics file unreadable
      </button>
    );
  }
  if (resolution.notice === "sidecarFailedUsingEmbedded") {
    return <span title="The .lrc file couldn't be read.">Embedded lyrics</span>;
  }
  return resolution.document.content.kind === "plain" ? <span>Unsynced lyrics</span> : null;
}

/**
 * The next track at the end of the waveform band, close to the time axis it will follow: a
 * fixed-width slot, so the waveform's width only changes with the layout and never with the
 * queue. Opens the queue panel. Its second line gives way on a narrow layer.
 */
function UpNext({ className }: { className?: string }) {
  const { queue } = usePlaybackQueue();
  const openQueue = useQueuePanelStore((state) => state.open);
  const next = queue?.upcoming[0];
  return (
    <button
      type="button"
      aria-label={
        next === undefined
          ? "End of queue. Open the queue"
          : `Up next: ${next.title}. Open the queue`
      }
      onClick={openQueue}
      className={cn(
        "flex w-64 shrink-0 cursor-pointer items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {next === undefined ? (
        <span className="text-sm text-muted-foreground">End of queue</span>
      ) : (
        <>
          <Artwork artwork={next.artwork} className="size-8 shrink-0 rounded-sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-foreground">{next.title}</span>
            {next.artist ? (
              <span className="block truncate text-sm text-muted-foreground @max-[40rem]/npw:hidden">
                {next.artist}
              </span>
            ) : null}
          </span>
        </>
      )}
    </button>
  );
}
