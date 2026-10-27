import { type QueueItemId } from "#lib/native/bindings";
import { useApp } from "#lib/app/app.svelte";

/**
 * What Now Playing's rows and labels do when the reader acts on them: seek to a lyric line, play a
 * queue item, copy a file name. Construct it while a component initialises.
 */
export class NowPlayingActions {
  readonly #app = useApp();

  /** Seeks the playback to a lyric line's start. */
  public readonly seek = (startMs: number): void => {
    const {
      ui: { actions },
      player: playback,
    } = this.#app;
    actions.run(() => playback.seek(startMs));
  };

  /** Plays a queue item; the queue keeps every other item in place. */
  public readonly playerPlayQueueItem = (queueItemId: QueueItemId): void => {
    const {
      ui: { actions },
      player: playback,
    } = this.#app;
    actions.run(() => playback.playerPlayQueueItem(queueItemId));
  };

  /** Copies text to the clipboard; a refused copy is reported. */
  public readonly copy = (text: string): void => {
    this.#app.ui.actions.run(() => navigator.clipboard.writeText(text));
  };
}
