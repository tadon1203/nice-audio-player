import { onDestroy } from "svelte";
import { AppServices } from "#lib/app/app-services.svelte";

/**
 * The seek drag of the waveform band. While the pointer drags, the playback clock holds the bar at
 * the preview position instead of playing on. A commit holds the position until the seek is
 * reported. Construct during component initialization.
 */
export class SeekDrag {
  readonly #playback = AppServices.current().player;
  #preview = $state<number | null>(null);
  #release: (() => void) | null = null;

  public constructor() {
    onDestroy(() => this.#letGo());
  }

  public get preview(): number | null {
    return this.#preview;
  }

  public get dragging(): boolean {
    return this.#preview !== null;
  }

  public readonly input = (ms: number): void => {
    this.#preview = ms;
    this.#hold(ms);
  };

  public readonly cancel = (): void => {
    this.#letGo();
    this.#preview = null;
  };

  /** Seeks to `ms`. The returned promise settles when the seek is reported. */
  public readonly commit = (ms: number): Promise<void> => {
    this.#hold(ms);
    return this.#playback.seek(ms).finally(() => {
      this.#letGo();
      this.#preview = null;
    });
  };

  #hold(ms: number): void {
    const next = this.#playback.clock.hold(ms);
    this.#release?.();
    this.#release = next;
  }

  #letGo(): void {
    this.#release?.();
    this.#release = null;
  }
}
