import type { PlaybackQueueItem, PlaybackQueueMoveDirection, PlaybackRepeatMode } from "@/bindings";
import { formatPlaybackTime } from "@/lib/playback-time";
import { AppIcon } from "./ui/AppIcon";
import { StateIcon } from "./ui/StateIcon";
import { Button } from "./ui/button";
import { Toggle } from "./ui/toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { PlayingMarker } from "./ui/PlayingMarker";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useScrollRegion } from "@/hooks/use-scroll-region";
type QueueState = {
  current: PlaybackQueueItem | null;
  upcoming: PlaybackQueueItem[];
  repeatMode: PlaybackRepeatMode;
  shuffleEnabled: boolean;
  pending: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setRepeatMode: (mode: PlaybackRepeatMode) => void;
  setShuffle: (value: boolean) => void;
  removeItem: (id: string) => void;
  moveItem: (id: string, direction: PlaybackQueueMoveDirection) => void;
  clearUpcoming: () => void;
};

export function PlaybackQueuePane({
  queue,
  playbackStatus,
}: {
  queue: QueueState;
  playbackStatus: "playing" | "paused" | "stopped" | "failed";
}) {
  const { setViewportElement } = useScrollRegion();
  const current = queue.current;
  const upcoming = queue.upcoming;
  return (
    <div className="grid h-full min-h-full min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-x-clip">
      {queue.error ? (
        <div className="max-w-[70ch] p-6 text-error" role="alert">
          <p>Queue is unavailable. {queue.error}</p>
          <button
            className="mt-3 min-h-10 rounded-control border border-border-control bg-transparent px-3 text-text-primary hover:bg-surface-hover disabled:text-text-disabled"
            type="button"
            onClick={() => void queue.refresh()}
            disabled={queue.pending}
          >
            Retry queue
          </button>
        </div>
      ) : null}
      {!queue.error ? (
        <section className="min-w-0 px-6 pb-5 pt-2" aria-labelledby="now-playing-title">
          <p className="mb-2.5 text-caption text-text-muted" id="now-playing-title">
            Now playing
          </p>
          {current ? (
            <div className="flex min-w-0 items-center gap-3">
              {playbackStatus === "stopped" || playbackStatus === "failed" ? null : (
                <PlayingMarker />
              )}
              <div className="grid min-w-0 gap-0.5">
                <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-body-sm font-medium">
                  {current.title}
                </strong>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-caption text-text-muted">
                  {current.artist ?? " "}
                </span>
              </div>
              {current.durationMs ? (
                <time className="ms-auto flex-none text-caption tabular-nums text-text-muted">
                  {formatPlaybackTime(current.durationMs)}
                </time>
              ) : null}
            </div>
          ) : (
            <p className="text-text-secondary">Queue is empty.</p>
          )}
        </section>
      ) : null}
      {!queue.error ? (
        <section
          className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]"
          aria-labelledby="up-next-title"
        >
          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <h3
              id="up-next-title"
              className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-body-md font-semibold"
            >
              Up next
            </h3>
            <button
              className="min-h-10 rounded-control border-0 bg-transparent px-2.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              type="button"
              disabled={!upcoming.length || queue.pending}
              onClick={queue.clearUpcoming}
            >
              Clear upcoming
            </button>
          </div>
          <div
            ref={setViewportElement}
            className="min-h-0 overflow-x-clip overflow-y-auto"
            data-scroll-region
            data-slot="queue-list"
          >
            <div>
              {upcoming.length ? (
                upcoming.map((item, index) => {
                  const absolute = index;
                  const first = index === 0;
                  const last = index === upcoming.length - 1;
                  return (
                    <div
                      className="grid min-h-[68px] grid-cols-[24px_minmax(0,1fr)_56px_40px] items-center gap-3 border-b border-border-subtle px-6 py-2"
                      key={item.id}
                      data-slot="queue-row"
                    >
                      <span className="text-numeric text-text-secondary">{absolute + 1}</span>
                      <div className="grid min-w-0 gap-0.5">
                        <strong
                          className="overflow-hidden text-ellipsis whitespace-nowrap text-body-sm font-medium"
                          title={item.title}
                        >
                          {item.title}
                        </strong>
                        {item.artist ? (
                          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-caption text-text-muted">
                            {item.artist}
                          </span>
                        ) : null}
                      </div>
                      {item.durationMs ? (
                        <time className="ms-auto flex-none text-caption tabular-nums text-text-muted">
                          {formatPlaybackTime(item.durationMs)}
                        </time>
                      ) : null}
                      <div>
                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <DropdownMenuTrigger
                                  render={
                                    <Button
                                      variant="icon"
                                      aria-label={`More actions for ${item.title}`}
                                    />
                                  }
                                />
                              }
                            >
                              <AppIcon name="more" />
                            </TooltipTrigger>
                            <TooltipContent>More actions</TooltipContent>
                          </Tooltip>
                          <DropdownMenuContent>
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                disabled={first || queue.pending}
                                onClick={() => {
                                  queue.moveItem(item.id, "earlier");
                                }}
                              >
                                Move earlier
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={last || queue.pending}
                                onClick={() => {
                                  queue.moveItem(item.id, "later");
                                }}
                              >
                                Move later
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={queue.pending}
                                onClick={() => {
                                  queue.removeItem(item.id);
                                }}
                              >
                                Remove from queue
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="p-6 text-text-secondary">
                  {current ? "Nothing up next." : "Queue is empty."}
                </p>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function PlaybackQueueActions({ queue }: { queue: QueueState }) {
  const repeatLabel =
    queue.repeatMode === "off"
      ? "Repeat off"
      : queue.repeatMode === "all"
        ? "Repeat all"
        : "Repeat one";
  return (
    <div className="flex items-center gap-1" data-slot="queue-tools">
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              type="button"
              pressed={queue.shuffleEnabled}
              aria-pressed={queue.shuffleEnabled}
              aria-label={queue.shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"}
              onClick={() => queue.setShuffle(!queue.shuffleEnabled)}
            />
          }
        >
          <AppIcon name="shuffle" />
        </TooltipTrigger>
        <TooltipContent>
          {queue.shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="icon"
              type="button"
              aria-pressed={queue.repeatMode !== "off"}
              aria-label={repeatLabel}
              onClick={() =>
                queue.setRepeatMode(
                  queue.repeatMode === "off" ? "all" : queue.repeatMode === "all" ? "one" : "off",
                )
              }
            />
          }
        >
          <StateIcon state={queue.repeatMode === "one" ? "repeatOne" : "repeat"} />
          <span className="sr-only">{repeatLabel}</span>
        </TooltipTrigger>
        <TooltipContent>{repeatLabel}</TooltipContent>
      </Tooltip>
    </div>
  );
}
