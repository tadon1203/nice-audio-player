import { PlayPauseIcon } from "@/renderer/shared/ui/play-pause-icon";
import { MISSING } from "@/renderer/shared/lib/format";
import { cn } from "@/renderer/shared/lib/utils";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { trackTableBreakpoints } from "./breakpoints";
import { useTrackTableController } from "./track-table-context";
import type { TrackTableRow } from "./types";

/** The fixed action/state slot: Play on hover or focus, Pause/Resume while active. */
export function TrackAction({ row }: { row: TrackTableRow }) {
  const { layout, activeTrackId, playbackStatus, onPlayTrack, onPauseActive, onResumeActive } =
    useTrackTableController();
  const active = row.id === activeTrackId;
  const available = row.playable && row.availability === "available";
  const action =
    active && playbackStatus === "playing"
      ? { label: `Pause ${row.title}`, run: onPauseActive, showsPause: true, persistent: true }
      : active && playbackStatus === "paused"
        ? { label: `Resume ${row.title}`, run: onResumeActive, showsPause: false, persistent: true }
        : {
            label: `Play ${row.title}`,
            run: () => onPlayTrack(row.id),
            showsPause: false,
            persistent: false,
          };
  const disabled = !available || action.run === undefined;

  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      className={cn(
        layout === "album"
          ? "focus-visible:ring-0"
          : cn(
              "absolute transition-opacity",
              !action.persistent &&
                "opacity-0 group-hover/track:opacity-100 group-focus-within/track:opacity-100",
              disabled && !action.persistent && "pointer-events-none opacity-0",
            ),
      )}
      aria-label={action.label}
      title={action.label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        action.run?.();
      }}
    >
      <PlayPauseIcon playing={action.showsPause} />
    </Button>
  );

  if (layout !== "album") {
    return <div className="relative flex h-9 w-full items-center justify-center">{button}</div>;
  }

  // The number and the button are two stacked cells in a one-cell window; hover slides the
  // number up and the button in. The ring sits on the window so the clip doesn't cut it.
  return (
    <div className="flex h-9 w-full items-center justify-center">
      <div className="size-9 overflow-clip rounded-md has-focus-visible:ring-2 has-focus-visible:ring-ring">
        <div
          className={cn(
            "flex flex-col transition-transform duration-160 ease-out",
            action.persistent && "-translate-y-9",
            available &&
              !action.persistent &&
              "group-hover/track:-translate-y-9 group-focus-within/track:-translate-y-9",
          )}
        >
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center text-sm text-muted-foreground"
          >
            {row.trackNumber ?? MISSING}
          </span>
          {button}
        </div>
      </div>
    </div>
  );
}

export function TrackTitle({ row }: { row: TrackTableRow }) {
  const { layout } = useTrackTableController();

  return (
    <div className="min-w-0 text-left">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate" title={row.title}>
          {row.title}
        </span>
        {row.availability === "missing" ? (
          <span className="shrink-0 text-sm text-muted-foreground">Missing</span>
        ) : null}
      </div>
      {layout === "album" && row.artist ? (
        <span
          className={cn(
            "mt-0.5 hidden truncate text-sm text-muted-foreground",
            trackTableBreakpoints.compact.show,
          )}
          title={row.artist}
        >
          {row.artist}
        </span>
      ) : null}
    </div>
  );
}

export function TrackText({ value }: { value: string | null | undefined }) {
  const text = value ?? MISSING;
  return <span title={text}>{text}</span>;
}
