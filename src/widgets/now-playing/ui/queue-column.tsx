import { useEffect, useRef } from "react";
import { Play } from "lucide-react";
import { usePlaybackActions, usePlaybackQueue } from "@/entities/playback";
import { useQueuePanelStore } from "@/features/toggle-queue-panel";
import { formatDuration } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Artwork } from "@/shared/ui/artwork";
import type { PlaybackQueueItem } from "@/shared/ipc";
import { opacityAtDistance } from "../model/distance-opacity";
import { ANCHOR_FRACTION, useAnchorPadding } from "../model/use-anchor-padding";
import { ReadingBand } from "./reading-band";

/** No transition: reduced motion gives everything a 100ms one, and the scroll target is measured right after the spacer changes. */
const SPACER = "transition-none";

export type QueueVariant = "full" | "rail";

/**
 * The right column when a track has no lyrics (`full`), or the narrow column beside lyrics on a
 * wide screen (`rail`): what really plays, in the order it plays. Reads the queue and the
 * queue panel's open state; `QueueList` draws it.
 */
export function QueueColumn({ variant, className }: { variant: QueueVariant; className?: string }) {
  const { queue } = usePlaybackQueue();
  const { playQueueItem } = usePlaybackActions();
  const openQueue = useQueuePanelStore((state) => state.open);
  return (
    <QueueList
      variant={variant}
      history={queue?.history ?? []}
      current={queue?.current ?? null}
      upcoming={queue?.upcoming ?? []}
      upcomingCount={queue?.upcomingCount ?? 0}
      onPlay={(id) => void playQueueItem(id)}
      onOpenQueue={openQueue}
      className={className}
    />
  );
}

/** A future row's Gutter number: how many tracks from now it is. */
function gutterLabel(offset: number): string {
  return String(offset);
}

/**
 * The list itself. `full`: history (oldest first), the current track, then what is upcoming,
 * with the current one scrolled to 40% when it changes, and only then. `rail`: only what is
 * upcoming, from the top. Only upcoming rows can be played, which moves within the queue and so
 * replaces nothing.
 */
export function QueueList({
  variant,
  history,
  current,
  upcoming,
  upcomingCount,
  onPlay,
  onOpenQueue,
  className,
}: {
  variant: QueueVariant;
  history: readonly PlaybackQueueItem[];
  current: PlaybackQueueItem | null;
  upcoming: readonly PlaybackQueueItem[];
  upcomingCount: number;
  onPlay: (id: string) => void;
  onOpenQueue: () => void;
  className?: string;
}) {
  const hidden = Math.max(0, upcomingCount - upcoming.length);
  const more =
    hidden > 0 ? (
      <button
        type="button"
        onClick={onOpenQueue}
        className="cursor-pointer rounded-sm px-1 py-2 text-left text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {hidden} more in the queue
      </button>
    ) : null;

  if (variant === "rail") {
    if (upcoming.length === 0) return null;
    return (
      <div className={cn("flex h-full min-h-0 flex-col gap-2", className)}>
        <p className="text-sm text-muted-foreground">Up next</p>
        <div
          role="list"
          aria-label="Up next"
          className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {upcoming.map((item) => (
            <div key={item.id} role="listitem">
              <button
                type="button"
                aria-label={`Play ${item.title}`}
                onClick={() => onPlay(item.id)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-sm py-1.5 text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Artwork artwork={item.artwork} className="size-10 shrink-0 rounded-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base text-foreground">{item.title}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {item.artist}
                  </span>
                </span>
              </button>
            </div>
          ))}
          {more}
        </div>
      </div>
    );
  }

  return (
    <FullList
      history={history}
      current={current}
      upcoming={upcoming}
      more={more}
      emptyNote={upcomingCount === 0}
      onPlay={onPlay}
      className={className}
    />
  );
}

function FullList({
  history,
  current,
  upcoming,
  more,
  emptyNote,
  onPlay,
  className,
}: {
  history: readonly PlaybackQueueItem[];
  current: PlaybackQueueItem | null;
  upcoming: readonly PlaybackQueueItem[];
  more: React.ReactNode;
  emptyNote: boolean;
  onPlay: (id: string) => void;
  className?: string;
}) {
  const anchor = useAnchorPadding();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureContainer = anchor.ref;
  const setContainer = (element: HTMLDivElement | null) => {
    containerRef.current = element;
    return measureContainer(element);
  };
  const anchorHeight = anchor.height;
  const currentId = current?.id ?? null;
  const hasRows = current !== null || history.length + upcoming.length > 0;
  useEffect(() => {
    const container = containerRef.current;
    const row = container?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!container || !row) return;
    if (!container || !row) return;
    const center = row.offsetTop + row.offsetHeight / 2;
    container.scrollTop = Math.max(0, center - container.clientHeight * ANCHOR_FRACTION);
  }, [currentId, hasRows, anchorHeight]);

  if (!hasRows) return null;

  const rows = [
    ...history.map((item) => ({ item, offset: -1 })),
    ...(current !== null ? [{ item: current, offset: 0 }] : []),
    ...upcoming.map((item, index) => ({ item, offset: index + 1 })),
  ];
  const currentPosition = history.length;
  return (
    <div className={cn("relative h-full min-h-0", className)}>
      <ReadingBand />
      <div
        ref={setContainer}
        role="list"
        aria-label="Queue"
        style={anchor.style}
        className="relative h-full overflow-y-auto mask-[linear-gradient(to_bottom,transparent,black_15%,black_80%,transparent)] [scrollbar-width:none] forced-colors:mask-none [&::-webkit-scrollbar]:hidden"
      >
        <div aria-hidden="true" className={SPACER} style={{ height: "var(--anchor-top)" }} />
        {rows.map(({ item, offset }, index) => {
          const isCurrent = offset === 0;
          const isPast = offset < 0;
          const tone = isCurrent
            ? "text-foreground"
            : isPast
              ? "text-faint-foreground"
              : "text-muted-foreground";
          return (
            <div
              key={item.id}
              role="listitem"
              aria-current={isCurrent ? "true" : undefined}
              style={{ opacity: opacityAtDistance(Math.abs(index - currentPosition)) }}
              className={tone}
            >
              <button
                type="button"
                disabled={offset <= 0}
                aria-label={`Play ${item.title}`}
                onClick={() => onPlay(item.id)}
                className="flex w-full cursor-pointer items-baseline gap-4 rounded-sm py-2 text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
              >
                <span className="flex w-8 shrink-0 justify-end text-right text-sm tabular-nums">
                  {isCurrent ? (
                    <Play
                      aria-hidden
                      className="size-3.5 translate-y-0.5 fill-(--artwork-accent) text-(--artwork-accent)"
                    />
                  ) : offset > 0 ? (
                    gutterLabel(offset)
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[clamp(1.125rem,3.2cqi,1.75rem)] leading-snug">
                    {item.title}
                  </span>
                  <span className="flex gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{item.artist}</span>
                    <span className="shrink-0 tabular-nums">{formatDuration(item.durationMs)}</span>
                  </span>
                </span>
              </button>
            </div>
          );
        })}
        {emptyNote && current !== null ? (
          <p className="py-2 pl-12 text-sm text-muted-foreground">Nothing else in the queue</p>
        ) : null}
        {more !== null ? <div className="pl-12">{more}</div> : null}
        <div aria-hidden="true" className={SPACER} style={{ height: "var(--anchor-bottom)" }} />
      </div>
    </div>
  );
}
