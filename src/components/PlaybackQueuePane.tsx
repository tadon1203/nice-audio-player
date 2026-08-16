import { useEffect, useRef, useState } from "react";
import type { PlaybackQueueItem, PlaybackRepeatMode } from "@/bindings";
import { formatPlaybackTime } from "@/lib/playback-time";

type QueueState = {
  items: PlaybackQueueItem[];
  repeatMode: PlaybackRepeatMode;
  shuffle: boolean;
  pending: boolean;
  error: string | null;
  setRepeatMode: (mode: PlaybackRepeatMode) => void;
  setShuffle: (value: boolean) => void;
  removeItem: (id: string) => void;
  moveItem: (id: string, earlier: boolean) => void;
  clearUpcoming: () => void;
};

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
function ShuffleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h2c4 0 5 10 10 10h4M16 5l4 2-4 2M16 15l4 2-4 2M4 17h2c1.7 0 2.7-1.3 3.5-2.8M14.5 9.8C15.3 8.3 16.3 7 18 7h2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 8h12l-2.5-2.5M19 16H7l2.5 2.5M19 8v3M5 16v-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlaybackQueuePane({
  queue,
  onClose,
  currentTitle,
  currentArtist,
}: {
  queue: QueueState;
  onClose: () => void;
  currentTitle: string;
  currentArtist: string | null;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const current = queue.items.find((item) => item.isCurrent);
  const upcoming = queue.items.filter((item) => !item.isCurrent);
  const repeatLabel =
    queue.repeatMode === "off"
      ? "Repeat off"
      : queue.repeatMode === "all"
        ? "Repeat all"
        : "Repeat one";
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".playback-queue__menu-wrap")) setMenuId(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  return (
    <aside
      className="playback-queue"
      aria-labelledby="playback-queue-title"
      data-testid="playback-queue"
    >
      <header className="playback-queue__header">
        <h2 id="playback-queue-title">Queue</h2>
        <div className="playback-queue__tools">
          <button
            type="button"
            className={`playback-queue__icon-button${queue.shuffle ? " is-selected" : ""}`}
            aria-pressed={queue.shuffle}
            aria-label={queue.shuffle ? "Turn shuffle off" : "Turn shuffle on"}
            onClick={() => queue.setShuffle(!queue.shuffle)}
          >
            <ShuffleIcon />
          </button>
          <button
            type="button"
            className={`playback-queue__icon-button${queue.repeatMode !== "off" ? " is-selected" : ""}`}
            aria-label={repeatLabel}
            onClick={() =>
              queue.setRepeatMode(
                queue.repeatMode === "off" ? "all" : queue.repeatMode === "all" ? "one" : "off",
              )
            }
          >
            <RepeatIcon />
            <span className="sr-only">{repeatLabel}</span>
          </button>
          <button type="button" className="playback-queue__close" onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      {queue.error ? (
        <p className="playback-queue__error" role="alert">
          {queue.error}
        </p>
      ) : null}
      <section className="playback-queue__now" aria-labelledby="now-playing-title">
        <p className="playback-queue__eyebrow" id="now-playing-title">
          Now playing
        </p>
        {current ? (
          <div className="playback-queue__current">
            <span className="playback-queue__playing-bars" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <div>
              <strong>{currentTitle || current.title}</strong>
              <span>{currentArtist ?? current.artist ?? " "}</span>
            </div>
            {current.durationMs ? <time>{formatPlaybackTime(current.durationMs)}</time> : null}
          </div>
        ) : (
          <p className="playback-queue__empty">Queue is empty.</p>
        )}
      </section>
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
              const absolute = queue.items.indexOf(item);
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
                      className="playback-queue__more"
                      aria-label={`More actions for ${item.title}`}
                      aria-haspopup="menu"
                      aria-expanded={menuId === item.id}
                      onClick={() => setMenuId(menuId === item.id ? null : item.id)}
                    >
                      <MoreIcon />
                    </button>
                    {menuId === item.id ? (
                      <div className="playback-queue__menu" role="menu">
                        <button
                          role="menuitem"
                          disabled={first || queue.pending}
                          onClick={() => {
                            queue.moveItem(item.id, true);
                            setMenuId(null);
                          }}
                        >
                          Move earlier
                        </button>
                        <button
                          role="menuitem"
                          disabled={last || queue.pending}
                          onClick={() => {
                            queue.moveItem(item.id, false);
                            setMenuId(null);
                          }}
                        >
                          Move later
                        </button>
                        <button
                          role="menuitem"
                          disabled={queue.pending}
                          onClick={() => {
                            queue.removeItem(item.id);
                            setMenuId(null);
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
    </aside>
  );
}
