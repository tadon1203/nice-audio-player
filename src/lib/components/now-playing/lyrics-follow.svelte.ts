import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { createAnchorFollow } from "./anchor-follow.svelte";
import {
  decideLineChange,
  isScrollIntentKey,
  offscreenSide,
  type FollowMode,
  type OffscreenSide,
  type ScrollHow,
} from "./lyrics-follow-model";

const isGutterTarget = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[data-slot="lyrics-gutter"]') !== null;

/**
 * Follow/free auto-scroll for the lyrics panel. Follow keeps the centre of the current line 40%
 * from the top (the panel's spacers let the first and last lines reach it). What a line change
 * does is decided by `decideLineChange`; this moves the list: animated, set at once, or set at
 * once with the list faded in. Reduced motion always sets it at once.
 *
 * Wheel, touch, pointer-down (outside the Gutter) or scroll-intent keys switch to free, which
 * shows `Jump to current line` while the current line is out of view. Follow resumes on that
 * button, on Esc, or at the first line change after 3s without interaction. Call it while a
 * component initialises.
 */
export function createLyricsFollow(currentIndex: () => number) {
  const lines = new Map<number, HTMLElement>();
  let mode = $state<FollowMode>("follow");
  let offscreen = $state.raw<OffscreenSide>(null);
  let lastInteractionAt = 0;
  let previousIndex: number | null = null;
  let container = $state.raw<HTMLElement | null>(null);
  const mover = createAnchorFollow();
  const stopRunning = mover.stop;

  const scrollTo = (index: number, how: ScrollHow) => {
    const line = lines.get(index);
    if (line !== undefined) mover.scrollToRow(line, how);
  };

  const markUserScroll = () => {
    stopRunning();
    lastInteractionAt = Date.now();
    mode = "free";
  };

  const jumpToCurrent = () => {
    mode = "follow";
    scrollTo(untrack(currentIndex), "animate");
  };

  // React to the current line changing, and only to that.
  $effect(() => {
    const current = currentIndex();
    untrack(() => {
      const decision = decideLineChange({
        previous: previousIndex,
        current,
        mode,
        now: Date.now(),
        lastInteractionAt,
      });
      previousIndex = current;
      mode = decision.mode;
      if (decision.scroll !== null) scrollTo(current, decision.scroll);
    });
  });

  // Which side the current line is off-screen on, while the reader is free.
  $effect(() => {
    const element = container;
    const index = currentIndex();
    const line = untrack(() => lines.get(index));
    if (mode !== "free" || element === null || line === undefined) {
      offscreen = null;
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      offscreen = "below";
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry === undefined) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 1) {
          offscreen = null;
          return;
        }
        const list = entry.rootBounds ?? element.getBoundingClientRect();
        offscreen = offscreenSide(entry.boundingClientRect, list) ?? "below";
      },
      { root: element, threshold: 1 },
    );
    observer.observe(line);
    return () => observer.disconnect();
  });

  /** The scroll container. */
  const containerAttachment: Attachment<HTMLElement> = (node) => {
    container = node;
    const detach = mover.attach(node);
    return () => {
      detach?.();
      if (container === node) container = null;
    };
  };

  return {
    get mode() {
      return mode;
    },
    get offscreen() {
      return offscreen;
    },
    container: containerAttachment,
    /** One line's element: registers it so the list can scroll to it. */
    line(index: number): Attachment<HTMLElement> {
      return (node) => {
        lines.set(index, node);
        return () => {
          if (lines.get(index) === node) lines.delete(index);
        };
      };
    },
    jumpToCurrent,
    /** The spacers changed size: keep the present on the anchor (only while following). */
    realign() {
      if (untrack(() => mode) === "follow") scrollTo(untrack(currentIndex), "instant");
    },
    onwheel: markUserScroll,
    ontouchstart: markUserScroll,
    onpointerdown(event: PointerEvent) {
      if (!isGutterTarget(event.target)) markUserScroll();
    },
    onkeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (mode === "free") {
          event.stopPropagation();
          jumpToCurrent();
        }
        return;
      }
      if (isScrollIntentKey(event.key)) markUserScroll();
    },
  };
}
