import { describe, expect, it } from "vitest";
import { createDrawLoop, type FrameScheduler } from "./draw-loop";

function fakeFrames() {
  let next = 1;
  const queued = new Map<number, (now: number) => void>();
  const scheduler: FrameScheduler = {
    request: (callback) => {
      queued.set(next, callback);
      return next++;
    },
    cancel: (id) => void queued.delete(id),
  };
  return {
    scheduler,
    pending: () => queued.size,
    frame(now: number) {
      const callbacks = [...queued.values()];
      queued.clear();
      callbacks.forEach((callback) => callback(now));
    },
  };
}

describe("createDrawLoop", () => {
  it("asks for no frame until woken", () => {
    const frames = fakeFrames();
    createDrawLoop(() => true, frames.scheduler);
    expect(frames.pending()).toBe(0);
  });

  it("keeps asking while the display moves and stops once it rests", () => {
    const frames = fakeFrames();
    let moving = true;
    const loop = createDrawLoop(() => moving, frames.scheduler);
    loop.wake();
    frames.frame(0);
    frames.frame(16);
    expect(frames.pending()).toBe(1);
    moving = false;
    frames.frame(32);
    expect(frames.pending()).toBe(0);
  });

  it("resumes on wake, with no elapsed time carried over the sleep", () => {
    const frames = fakeFrames();
    const elapsed: number[] = [];
    let moving = false;
    const loop = createDrawLoop((s) => {
      elapsed.push(s);
      return moving;
    }, frames.scheduler);
    loop.wake();
    frames.frame(1000);
    expect(frames.pending()).toBe(0);
    moving = true;
    loop.wake();
    frames.frame(9000);
    expect(elapsed).toEqual([0, 0]);
    expect(frames.pending()).toBe(1);
  });

  it("does not stack frames when woken while running, and stop cancels", () => {
    const frames = fakeFrames();
    const loop = createDrawLoop(() => true, frames.scheduler);
    loop.wake();
    loop.wake();
    expect(frames.pending()).toBe(1);
    loop.stop();
    expect(frames.pending()).toBe(0);
  });
});
