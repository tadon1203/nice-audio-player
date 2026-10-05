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
export function createDrawLoop(
  step: (elapsedS: number) => boolean,
  scheduler: FrameScheduler,
): { wake: () => void; stop: () => void } {
  let frameId: number | null = null;
  let last: number | null = null;

  const tick = (now: number) => {
    const elapsed = last === null ? 0 : (now - last) / 1000;
    last = now;
    frameId = step(elapsed) ? scheduler.request(tick) : null;
    if (frameId === null) last = null;
  };

  return {
    wake() {
      if (frameId === null) frameId = scheduler.request(tick);
    },
    stop() {
      if (frameId !== null) scheduler.cancel(frameId);
      frameId = null;
      last = null;
    },
  };
}
