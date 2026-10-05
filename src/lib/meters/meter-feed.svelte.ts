import { Channel } from "@tauri-apps/api/core";
import { requireNative } from "$lib/native";
import { decodeMeterFrame, type MeterFrame } from "./frame";

/** Frames kept while nobody draws; older ones are dropped (a late frame has no meaning). */
const MAX_PENDING = 64;

/**
 * The Meter frames from the backend, for as long as `active()` is true: it subscribes when it
 * becomes true and unsubscribes when it turns false or the owner is destroyed (ADR 0012). Call it
 * while a component initialises. Frames are not state: `drain` hands over those that arrived since
 * it was last called, and none is kept after that. `onFrame` runs for each frame that arrives (the
 * backend sends none while the sound is silent and unchanged).
 */
export function createMeterFeed(
  active: () => boolean,
  onFrame?: () => void,
): { drain: () => MeterFrame[] } {
  let pending: MeterFrame[] = [];

  $effect(() => {
    if (!active()) return;
    pending = [];
    let ended = false;
    let subscription: number | null = null;
    const native = requireNative();

    const channel = new Channel<ArrayBuffer>((message) => {
      if (ended) return;
      const frame = decodeMeterFrame(message);
      if (frame === null) return;
      // The app-level E2E build (`VITE_E2E=1`) counts the frames the app consumes, for
      // `tests-app/` to read; a normal build drops this.
      if (import.meta.env.VITE_E2E) {
        const e2e = ((window as { __e2e?: { meterFrames: number } }).__e2e ??= { meterFrames: 0 });
        e2e.meterFrames += 1;
      }
      pending.push(frame);
      if (pending.length > MAX_PENDING) pending.shift();
      onFrame?.();
    });
    native.subscribeMeterFrames(channel).then(
      (id) => {
        if (ended) void native.unsubscribeMeterFrames(id).catch(() => {});
        else subscription = id;
      },
      () => {},
    );

    return () => {
      ended = true;
      pending = [];
      if (subscription !== null) void native.unsubscribeMeterFrames(subscription).catch(() => {});
    };
  });

  return {
    drain() {
      const frames = pending;
      pending = [];
      return frames;
    },
  };
}
