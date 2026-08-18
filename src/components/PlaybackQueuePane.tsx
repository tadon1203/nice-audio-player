import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { PlaybackQueueItem, PlaybackQueueMoveDirection, PlaybackRepeatMode } from "@/bindings";
import { formatPlaybackTime } from "@/lib/playback-time";
import { MoreIcon, RepeatIcon, ShuffleIcon } from "./icons";
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
  const menuRef = useRef<HTMLDivElement | null>(null);
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
    first?.focus();
  }, [menuId]);
  function closeMenu(restoreFocus = true) {
    setMenuId(null);
    if (restoreFocus) window.setTimeout(() => menuButtonRef.current?.focus(), 0);
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
      actions[next]?.focus();
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
                <span
                  className={`playback-queue__playing-bars${playbackStatus === "paused" ? " is-paused" : ""}`}
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                </span>
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
          <div className="playback-queue__list">
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
                      <button
                        ref={menuId === item.id ? menuButtonRef : undefined}
                        type="button"
                        className="icon-button playback-queue__more"
                        data-tooltip="More actions"
                        title="More actions"
                        aria-label={`More actions for ${item.title}`}
                        aria-haspopup="menu"
                        aria-expanded={menuId === item.id}
                        onClick={() => setMenuId(menuId === item.id ? null : item.id)}
                      >
                        <MoreIcon />
                      </button>
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
      <button
        type="button"
        className={`icon-button playback-queue__icon-button${queue.shuffleEnabled ? " is-selected" : ""}`}
        data-tooltip={queue.shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"}
        title={queue.shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"}
        aria-pressed={queue.shuffleEnabled}
        aria-label={queue.shuffleEnabled ? "Turn shuffle off" : "Turn shuffle on"}
        onClick={() => queue.setShuffle(!queue.shuffleEnabled)}
      >
        <ShuffleIcon />
      </button>
      <button
        type="button"
        className={`icon-button playback-queue__icon-button${queue.repeatMode !== "off" ? " is-selected" : ""}`}
        data-tooltip={repeatLabel}
        title={repeatLabel}
        aria-label={repeatLabel}
        onClick={() =>
          queue.setRepeatMode(
            queue.repeatMode === "off" ? "all" : queue.repeatMode === "all" ? "one" : "off",
          )
        }
      >
        <RepeatIcon />
        {queue.repeatMode === "one" ? <span className="playback-queue__repeat-one">1</span> : null}
        <span className="sr-only">{repeatLabel}</span>
      </button>
    </div>
  );
}
