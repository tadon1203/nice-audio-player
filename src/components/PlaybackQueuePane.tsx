import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PlaybackQueueItem, PlaybackQueueMoveDirection, PlaybackRepeatMode } from "@/bindings";
import { formatPlaybackTime } from "@/lib/playback-time";
import { AppIcon } from "./ui/AppIcon";
import { StateIcon } from "./ui/StateIcon";
import { IconButton } from "./ui/IconButton";
import { PlayingMarker } from "./ui/PlayingMarker";
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
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const restoreMenuFocusRef = useRef(false);
  const { setViewportElement, setContentElement, scrollToElement } = useScrollRegion();
  const current = queue.current;
  const upcoming = queue.upcoming;
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".playback-queue__menu-wrap")) setMenuId(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  useEffect(() => {
    if (!menuId) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    if (!first) return;
    first.focus({ preventScroll: true });
    scrollToElement(first, "nearest", "instant");
  }, [menuId, scrollToElement]);
  useLayoutEffect(() => {
    if (menuId || !restoreMenuFocusRef.current) return;
    restoreMenuFocusRef.current = false;
    const trigger = returnFocusRef.current;
    returnFocusRef.current = null;
    if (!trigger?.isConnected) return;
    trigger.focus({ preventScroll: true });
    scrollToElement(trigger, "nearest", "instant");
  }, [menuId, scrollToElement]);
  function closeMenu(restoreFocus = true) {
    restoreMenuFocusRef.current = restoreFocus;
    setMenuId(null);
  }
  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const actions = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    const currentIndex = actions.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (!actions.length) return;
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? actions.length - 1
            : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + actions.length) %
              actions.length;
      const target = actions[next];
      target?.focus({ preventScroll: true });
      if (target) scrollToElement(target, "nearest", "instant");
    }
  }
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
            <div ref={setContentElement} className="playback-queue__list-content">
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
                        <IconButton
                          ref={menuId === item.id ? menuButtonRef : undefined}
                          type="button"
                          className="playback-queue__more"
                          data-tooltip="More actions"
                          title="More actions"
                          aria-label={`More actions for ${item.title}`}
                          aria-haspopup="menu"
                          aria-expanded={menuId === item.id}
                          onClick={(event) => {
                            if (menuId === item.id) {
                              closeMenu();
                              return;
                            }
                            returnFocusRef.current = event.currentTarget;
                            setMenuId(item.id);
                          }}
                        >
                          <AppIcon name="more" />
                        </IconButton>
                        {menuId === item.id ? (
                          <div
                            ref={menuRef}
                            className="playback-queue__menu"
                            role="menu"
                            onKeyDown={handleMenuKeyDown}
                          >
                            <button
                              role="menuitem"
                              disabled={first || queue.pending}
                              onClick={() => {
                                queue.moveItem(item.id, "earlier");
                                closeMenu();
                              }}
                            >
                              Move earlier
                            </button>
                            <button
                              role="menuitem"
                              disabled={last || queue.pending}
                              onClick={() => {
                                queue.moveItem(item.id, "later");
                                closeMenu();
                              }}
                            >
                              Move later
                            </button>
                            <button
                              role="menuitem"
                              disabled={queue.pending}
                              onClick={() => {
                                queue.removeItem(item.id);
                                closeMenu();
                              }}
                            >
                              Remove from queue
                            </button>
                          </div>
                        ) : null}
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
      <IconButton
        type="button"
        className="playback-queue__icon-button"
        selected={queue.shuffleEnabled}
        data-tooltip={queue.shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"}
        title={queue.shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"}
        aria-pressed={queue.shuffleEnabled}
        aria-label={queue.shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"}
        onClick={() => queue.setShuffle(!queue.shuffleEnabled)}
      >
        <AppIcon name="shuffle" />
      </IconButton>
      <IconButton
        type="button"
        className="playback-queue__icon-button"
        selected={queue.repeatMode !== "off"}
        data-tooltip={repeatLabel}
        title={repeatLabel}
        aria-label={repeatLabel}
        onClick={() =>
          queue.setRepeatMode(
            queue.repeatMode === "off" ? "all" : queue.repeatMode === "all" ? "one" : "off",
          )
        }
      >
        <StateIcon state={queue.repeatMode === "one" ? "repeatOne" : "repeat"} />
        <span className="sr-only">{repeatLabel}</span>
      </IconButton>
    </div>
  );
}
