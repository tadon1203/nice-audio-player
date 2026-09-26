import { Pause, Play } from "lucide-react";
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
      ? { label: `Pause ${row.title}`, run: onPauseActive, icon: Pause, persistent: true }
      : active && playbackStatus === "paused"
        ? { label: `Resume ${row.title}`, run: onResumeActive, icon: Play, persistent: true }
        : {
            label: `Play ${row.title}`,
            run: () => onPlayTrack(row.id),
            icon: Play,
            persistent: false,
          };
  const Icon = action.icon;
  const disabled = !available || action.run === undefined;

  return (
    <div className="relative flex h-9 w-full items-center justify-center">
      {layout === "album" ? (
        <span
          aria-hidden="true"
          className={cn(
            "text-sm text-muted-foreground transition-opacity",
            available &&
              !action.persistent &&
              "group-hover/track:opacity-0 group-focus-within/track:opacity-0",
            action.persistent && "opacity-0",
          )}
        >
          {row.trackNumber ?? MISSING}
        </span>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className={cn(
          "absolute transition-opacity",
          !action.persistent &&
            "opacity-0 group-hover/track:opacity-100 group-focus-within/track:opacity-100",
          disabled && !action.persistent && "pointer-events-none opacity-0",
        )}
        aria-label={action.label}
        title={action.label}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          action.run?.();
        }}
      >
        <Icon aria-hidden="true" />
      </Button>
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
