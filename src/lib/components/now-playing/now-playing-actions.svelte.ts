import type { QueueItemId } from "#lib/native";
import { AppServices } from "#lib/shell/app-services.svelte";

/**
 * What Now Playing's rows and labels do when the reader acts on them: seek to a lyric line, play a
 * queue item, copy a file name. Construct it while a component initialises.
 */
export class NowPlayingActions {
  readonly #services = AppServices.current();

  /** Seeks the playback to a lyric line's start. */
  public readonly seek = (startMs: number): void => {
    const { actions, playback } = this.#services;
    actions.run(() => playback.seek(startMs));
  };

  /** Plays a queue item; the queue keeps every other item in place. */
  public readonly playQueueItem = (queueItemId: QueueItemId): void => {
    const { actions, playback } = this.#services;
    actions.run(() => playback.playQueueItem(queueItemId));
  };

  /** Copies text to the clipboard; a refused copy is reported. */
  public readonly copy = (text: string): void => {
    const { actions } = this.#services;
    actions.run(() => navigator.clipboard.writeText(text));
  };
}
