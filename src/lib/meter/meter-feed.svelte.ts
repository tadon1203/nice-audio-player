import type { MeterFrame } from "#lib/native/bindings";
import type { meter } from "#lib/native/commands";

/** Frames kept while nobody draws; older ones are dropped (a late frame has no meaning). */
const MAX_PENDING = 64;

/**
 * The Meter frames from the backend, for as long as `active()` is true: it starts sending when it
 * becomes true and stops when it turns false or the owner is destroyed. Construct it while a
 * component initialises. Frames are not state: `drain` hands over those that arrived since it was
 * last called, and none is kept after that. `onFrame` runs for each frame that arrives (the
 * backend sends none while the sound is silent and unchanged).
 */
export class MeterFeed {
  #pending: MeterFrame[] = [];

  public constructor(meterCommands: typeof meter, active: () => boolean, onFrame?: () => void) {
    $effect(() => {
      if (!active()) return;
      this.#pending = [];
      let ended = false;

      meterCommands
        .start((frame) => {
          if (ended) return;
          // The app-level E2E build (`VITE_E2E=1`) counts the frames the app consumes, for
          // `tests-app/` to read; a normal build drops this.
          if (import.meta.env.VITE_E2E) {
            const e2e = ((window as { __e2e?: { meterFrames: number } }).__e2e ??= {
              meterFrames: 0,
            });
            e2e.meterFrames += 1;
          }
          this.#pending.push(frame);
          if (this.#pending.length > MAX_PENDING) this.#pending.shift();
          onFrame?.();
        })
        .catch(() => {});

      return (): void => {
        ended = true;
        this.#pending = [];
        meterCommands.stop().catch(() => {});
      };
    });
  }

  /** The frames that arrived since the last call. */
  public drain(): MeterFrame[] {
    const frames = this.#pending;
    this.#pending = [];
    return frames;
  }
}
