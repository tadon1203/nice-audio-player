import { cancelFrame, frame } from "motion";
import type Lenis from "lenis";

const regions = new Set<Lenis>();
let frameProcess: ReturnType<typeof frame.update> | null = null;

export function registerLenis(lenis: Lenis) {
  regions.add(lenis);
  if (!frameProcess) {
    frameProcess = frame.update((data) => {
      regions.forEach((region) => region.raf(data.timestamp));
    }, true);
  }
  return () => {
    regions.delete(lenis);
    if (regions.size === 0) {
      if (frameProcess) cancelFrame(frameProcess);
      frameProcess = null;
    }
  };
}
