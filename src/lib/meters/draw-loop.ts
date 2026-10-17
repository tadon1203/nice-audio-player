/** What the draw loop needs from the page; injectable so the loop is testable without a browser. */
export type FrameScheduler = {
  request: (callback: (now: number) => void) => number;
  cancel: (id: number) => void;
};

/**
 * A frame loop that sleeps. `step` runs once per frame with the seconds since the previous frame
 * (0 on the first after a wake) and returns whether the display still moves; when it says no, the
 * loop stops asking for frames until `wake` (a new Meter frame arrived).
 */
export class DrawLoop {
  readonly #step: (elapsedS: number) => boolean;
  readonly #scheduler: FrameScheduler;
  #frameId: number | null = null;
  #last: number | null = null;

  public constructor(step: (elapsedS: number) => boolean, scheduler: FrameScheduler) {
    this.#step = step;
    this.#scheduler = scheduler;
  }

  /** Asks for a frame unless one is already coming. */
  public wake() {
    if (this.#frameId === null) this.#frameId = this.#scheduler.request(this.#tick);
  }

  public stop() {
    if (this.#frameId !== null) this.#scheduler.cancel(this.#frameId);
    this.#frameId = null;
    this.#last = null;
  }

  readonly #tick = (now: number) => {
    const elapsed = this.#last === null ? 0 : (now - this.#last) / 1000;
    this.#last = now;
    this.#frameId = this.#step(elapsed) ? this.#scheduler.request(this.#tick) : null;
    if (this.#frameId === null) this.#last = null;
  };
}
