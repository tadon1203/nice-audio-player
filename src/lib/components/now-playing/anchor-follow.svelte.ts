import type { Attachment } from "svelte/attachments";
import { getMotionBudget } from "$lib/shell/motion-budget.svelte";
import { RetargetableSpring } from "$lib/ui/motion/retargetable-spring.svelte";
import { springLinear } from "$lib/ui/motion/spring-curve";
import { crossfade, motionTokens } from "$lib/ui/motion/tokens";
import { anchorScrollTop } from "./anchor-column";
import type { ScrollHow } from "./lyrics-follow-model";

const FADE_MS = crossfade.duration;
/** The glide ends this close to its target. */
const GLIDE_END_PX = 0.5;
/** A scroll position further than this from what the glide wrote was moved by something else. */
const GLIDE_INTERRUPT_PX = 1;

/**
 * Moves a scroll container so a row's centre sits on the anchor line (40% from the top): animated
 * (a spring written to `scrollTop`, retargeted by every call with its velocity kept), set at
 * once, or set at once with the list faded in. Reduced motion always sets it at once. Shared by
 * the lyrics and the queue. Call it while a component initialises.
 * A glide lets go when something else moves the list (the wheel, the scrollbar, the browser
 * clamping it).
 */
export function createAnchorFollow() {
  const budget = getMotionBudget();
  let container = $state.raw<HTMLElement | null>(null);
  let fade: Animation | null = null;
  // The scroll position as a spring. It is written to the container only while a glide is active.
  const glide = new RetargetableSpring(0, {
    precision: GLIDE_END_PX,
    duration: motionTokens.move.duration,
  });
  let gliding = $state(false);
  /** The value last written to `scrollTop` by the glide, to tell whether something else moved it. */
  let lastWritten: number | null = null;

  const stop = () => {
    fade?.cancel();
    fade = null;
    glide.stop();
    gliding = false;
  };

  $effect(() => {
    const element = container;
    if (!gliding || element === null) return;
    const value = glide.current;
    const goal = glide.target;
    if (lastWritten !== null && Math.abs(element.scrollTop - lastWritten) > GLIDE_INTERRUPT_PX) {
      gliding = false;
      return;
    }
    // Close enough: land exactly on the target and stop.
    if (Math.abs(value - goal) < GLIDE_END_PX) {
      element.scrollTop = goal;
      gliding = false;
      return;
    }
    element.scrollTop = value;
    lastWritten = value;
  });

  $effect(() => stop);

  /** The scroll container. */
  const attach: Attachment<HTMLElement> = (node) => {
    container = node;
    return () => {
      if (container === node) container = null;
    };
  };

  return {
    attach,
    stop,
    /** Brings `row` to the anchor line. Does nothing before the container is mounted. */
    scrollToRow(row: HTMLElement, how: ScrollHow) {
      const element = container;
      if (element === null) return;
      stop();
      const target = anchorScrollTop({
        rowTop: row.offsetTop,
        rowHeight: row.offsetHeight,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      });
      const reduced = budget.current === "reduced";
      if (reduced || how !== "animate") {
        element.scrollTop = target;
        if (how === "fade" && !reduced) {
          fade = element.animate({ opacity: [0, 1] }, { duration: FADE_MS, easing: springLinear });
        }
        return;
      }
      glide.set(element.scrollTop, { instant: true });
      glide.set(target);
      lastWritten = null;
      gliding = true;
    },
  };
}
