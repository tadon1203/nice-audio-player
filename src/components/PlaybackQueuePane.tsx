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
    <div className="playback-queue">
      {queue.error ? (
        <div className="playback-queue__error" role="alert">
          <p>Queue is unavailable. {queue.error}</p>
          <button type="button" onClick={() => void queue.refresh()} disabled={queue.pending}>
            Retry queue
          </button>
        </div>
      ) : null}
      {!queue.error ? (
        <section className="playback-queue__now" aria-labelledby="now-playing-title">
          <p className="playback-queue__eyebrow" id="now-playing-title">
            Now playing
          </p>
          {current ? (
            <div className="playback-queue__current">
              {playbackStatus === "stopped" || playbackStatus === "failed" ? null : (
                <PlayingMarker />
              )}
              <div>
                <strong>{current.title}</strong>
                <span>{current.artist ?? " "}</span>
              </div>
              {current.durationMs ? <time>{formatPlaybackTime(current.durationMs)}</time> : null}
            </div>
          ) : (
            <p className="playback-queue__empty">Queue is empty.</p>
          )}
        </section>
      ) : null}
      {!queue.error ? (
        <section className="playback-queue__up-next" aria-labelledby="up-next-title">
          <div className="playback-queue__section-heading">
            <h3 id="up-next-title">Up next</h3>
            <button
              type="button"
              disabled={!upcoming.length || queue.pending}
              onClick={queue.clearUpcoming}
            >
              Clear upcoming
            </button>
          </div>
          <div ref={setViewportElement} className="playback-queue__list" data-scroll-region>
            <div className="playback-queue__list-content">
              {upcoming.length ? (
                upcoming.map((item, index) => {
                  const absolute = index;
                  const first = index === 0;
                  const last = index === upcoming.length - 1;
                  return (
                    <div className="playback-queue__row" key={item.id}>
                      <span className="playback-queue__index">{absolute + 1}</span>
                      <div className="playback-queue__track">
                        <strong title={item.title}>{item.title}</strong>
                        {item.artist ? <span>{item.artist}</span> : null}
                      </div>
                      {item.durationMs ? <time>{formatPlaybackTime(item.durationMs)}</time> : null}
                      <div className="playback-queue__menu-wrap">
                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <DropdownMenuTrigger
                                  render={
                                    <Button
                                      size="icon"
                                      variant="ghost"
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
                <p className="playback-queue__empty">
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
    <div className="playback-queue__tools">
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              type="button"
              className="playback-queue__icon-button"
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
              size="icon"
              type="button"
              className="playback-queue__icon-button"
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
