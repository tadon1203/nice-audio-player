import { animate } from "motion";
import { interfaceEase, motionDurationSeconds } from "@/lib/motion";
import { clampScrollTop } from "./scroll-geometry";

export type ScrollMode = "instant" | "smooth";
export interface ScrollAnimationController {
  scrollTo: (top: number, mode?: ScrollMode) => void;
  cancel: () => void;
  finalizeProgrammaticDelivery: () => void;
  get programmatic(): boolean;
  get active(): boolean;
}

export function createScrollAnimationController(container: HTMLElement): ScrollAnimationController {
  let controls: { stop: () => void } | null = null;
  let active = false;
  let programmatic = false;
  let settled = false;
  let targetTop = container.scrollTop;
  const cancel = () => {
    controls?.stop();
    controls = null;
    active = false;
    programmatic = false;
    settled = false;
  };
  const scrollTo = (top: number, mode: ScrollMode = "instant") => {
    cancel();
    const target = clampScrollTop(container, top);
    targetTop = target;
    programmatic = true;
    if (mode === "instant" || Math.abs(target - container.scrollTop) < 1) {
      container.scrollTop = target;
      settled = true;
      return;
    }
    const distance = Math.abs(target - container.scrollTop);
    const travel = Math.min(1, distance / Math.max(1, container.clientHeight));
    const duration =
      motionDurationSeconds.state +
      (motionDurationSeconds.content - motionDurationSeconds.state) * travel;
    active = true;
    controls = animate(container.scrollTop, target, {
      duration,
      ease: interfaceEase,
      onUpdate: (value) => {
        container.scrollTop = value;
      },
      onComplete: () => {
        active = false;
        controls = null;
        settled = true;
      },
    });
  };
  return {
    scrollTo,
    cancel,
    finalizeProgrammaticDelivery: () => {
      if (programmatic && settled && Math.abs(container.scrollTop - targetTop) < 1) {
        programmatic = false;
        settled = false;
      }
    },
    get programmatic() {
      return programmatic;
    },
    get active() {
      return active;
    },
  };
}
