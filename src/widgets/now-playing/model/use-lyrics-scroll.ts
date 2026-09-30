import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { animate, useReducedMotion } from "motion/react";
import { useMotionTransition } from "@/shared/ui/motion";
import { ANCHOR_FRACTION } from "./use-anchor-padding";

/** Manual scrolling gives way to the lyrics again on the next line change after this idle time. */
export const RETURN_TO_FOLLOW_MS = 3_000;
/** A seek that moves the current line at most this many lines is still animated. */
const MAX_ANIMATED_LINES = 3;
const FADE_S = 0.1;
const SCROLL_INTENT_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]);

export type OffscreenSide = "above" | "below" | null;

/**
 * Follow/free auto-scroll for the lyrics panel. Follow keeps the centre of the current line 40%
 * from the top (the panel's spacers let the first and last lines reach it). How it moves is a
 * fact about what happened: a normal step to the next line animates; opening the panel or a new
 * track sets the position at once; a seek (waveform, keys or Gutter) returns to follow and
 * animates only when it moved a few lines, otherwise it sets the position and fades the list in.
 * Reduced motion always sets it at once.
 *
 * Wheel, touch, pointer-down (outside the Gutter) or scroll-intent keys switch to free, which
 * shows `Jump to current line` while the current line is out of view. Follow resumes on that
 * button, on Esc, or at the first line change after 3s without interaction.
 */
export function useLyricsScroll(currentIndex: number) {
  const [mode, setMode] = useState<"follow" | "free">("follow");
  const [offscreen, setOffscreen] = useState<OffscreenSide>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef(new Map<number, HTMLElement>());
  const lastInteractionAt = useRef(0);
  const previousIndex = useRef<number | null>(null);
  const latestIndex = useRef(currentIndex);
  const modeRef = useRef(mode);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const reducedMotion = useReducedMotion() === true;
  const transition = useMotionTransition("mediumMove");
  latestIndex.current = currentIndex;
  modeRef.current = mode;

  const registerLine = useCallback((index: number, element: HTMLElement | null) => {
    if (element === null) lineRefs.current.delete(index);
    else lineRefs.current.set(index, element);
  }, []);

  const scrollTo = useCallback(
    (index: number, how: "instant" | "animate" | "fade") => {
      const container = containerRef.current;
      const line = lineRefs.current.get(index);
      if (container === null || line === undefined) return;
      controlsRef.current?.stop();
      const maxScroll = container.scrollHeight - container.clientHeight;
      const target = Math.max(
        0,
        Math.min(
          line.offsetTop + line.offsetHeight / 2 - container.clientHeight * ANCHOR_FRACTION,
          maxScroll,
        ),
      );
      if (reducedMotion || how !== "animate") {
        container.scrollTop = target;
        if (how === "fade" && !reducedMotion) {
          controlsRef.current = animate(container, { opacity: [0, 1] }, { duration: FADE_S });
        }
        return;
      }
      controlsRef.current = animate(container.scrollTop, target, {
        ...transition,
        onUpdate: (value) => {
          container.scrollTop = value;
        },
      });
    },
    [reducedMotion, transition],
  );

  const markUserScroll = () => {
    lastInteractionAt.current = Date.now();
    setMode("free");
  };

  const jumpToCurrent = useCallback(() => {
    setMode("follow");
    scrollTo(latestIndex.current, "animate");
  }, [scrollTo]);

  // The spacers change size when the panel is measured or resized: keep the present on the anchor.
  const realign = useCallback(() => {
    if (modeRef.current === "follow") scrollTo(latestIndex.current, "instant");
  }, [scrollTo]);

  // React to the current line changing, and only to that.
  useEffect(() => {
    const previous = previousIndex.current;
    previousIndex.current = currentIndex;
    if (previous === null) {
      scrollTo(currentIndex, "instant");
      return;
    }
    if (currentIndex === previous) return;
    if (currentIndex === previous + 1) {
      if (modeRef.current === "follow") {
        scrollTo(currentIndex, "animate");
      } else if (Date.now() - lastInteractionAt.current >= RETURN_TO_FOLLOW_MS) {
        setMode("follow");
        scrollTo(currentIndex, "animate");
      }
      return;
    }
    // A seek, from wherever it came.
    setMode("follow");
    scrollTo(
      currentIndex,
      Math.abs(currentIndex - previous) <= MAX_ANIMATED_LINES ? "animate" : "fade",
    );
  }, [currentIndex, scrollTo]);

  useEffect(() => () => controlsRef.current?.stop(), []);

  // Which side the current line is off-screen on, while the reader is free.
  useEffect(() => {
    const container = containerRef.current;
    const line = lineRefs.current.get(currentIndex);
    if (mode !== "free" || container === null || line === undefined) {
      setOffscreen(null);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setOffscreen("below");
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry === undefined) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 1) {
          setOffscreen(null);
          return;
        }
        const rootTop = entry.rootBounds?.top ?? container.getBoundingClientRect().top;
        setOffscreen(entry.boundingClientRect.top < rootTop ? "above" : "below");
      },
      { root: container, threshold: 1 },
    );
    observer.observe(line);
    return () => observer.disconnect();
  }, [mode, currentIndex]);

  const isGutterTarget = (target: EventTarget | null) =>
    target instanceof Element && target.closest('[data-slot="lyrics-gutter"]') !== null;

  return {
    mode,
    offscreen,
    containerRef,
    registerLine,
    jumpToCurrent,
    realign,
    containerHandlers: {
      onWheel: markUserScroll,
      onTouchStart: markUserScroll,
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (!isGutterTarget(event.target)) markUserScroll();
      },
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          if (mode === "free") {
            event.stopPropagation();
            jumpToCurrent();
          }
          return;
        }
        if (SCROLL_INTENT_KEYS.has(event.key)) markUserScroll();
      },
    },
  };
}
