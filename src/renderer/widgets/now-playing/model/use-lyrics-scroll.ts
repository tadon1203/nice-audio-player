import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { animate, useReducedMotion } from "motion/react";
import { useMotionTransition } from "@/renderer/shared/ui/motion";

const RETURN_TO_FOLLOW_MS = 4_000;
const FOLLOW_CHECK_INTERVAL_MS = 500;
const FOLLOW_POSITION_FRACTION = 1 / 3;
const SCROLL_INTENT_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]);

/**
 * Follow/free auto-scroll for the lyrics panel (redesign-plan.md §5 "Auto-scroll and detecting
 * user scroll"). Follow keeps the current line about a third from the top; wheel, touch,
 * pointer-down (outside the Gutter), or scroll-intent keys switch to free, which shows a
 * `Jump to current line` affordance. Follow resumes after ~4s idle away from the lyrics, on
 * that button, or when the caller resets it (track change, Gutter seek).
 */
export function useLyricsScroll(currentIndex: number) {
  const [mode, setMode] = useState<"follow" | "free">("follow");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef(new Map<number, HTMLElement>());
  const lastInteractionAt = useRef(0);
  const pointerOver = useRef(false);
  const reducedMotion = useReducedMotion() === true;
  const transition = useMotionTransition("mediumMove");

  const registerLine = useCallback((index: number, element: HTMLElement | null) => {
    if (element === null) lineRefs.current.delete(index);
    else lineRefs.current.set(index, element);
  }, []);

  const markUserScroll = () => {
    lastInteractionAt.current = Date.now();
    setMode("free");
  };

  const resetToFollow = useCallback(() => setMode("follow"), []);
  const jumpToCurrent = resetToFollow;

  useEffect(() => {
    if (mode !== "free") return;
    const timer = setInterval(() => {
      if (!pointerOver.current && Date.now() - lastInteractionAt.current >= RETURN_TO_FOLLOW_MS) {
        setMode("follow");
      }
    }, FOLLOW_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (mode !== "follow") return;
    const container = containerRef.current;
    const line = lineRefs.current.get(currentIndex);
    if (container === null || line === undefined) return;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const target = Math.max(
      0,
      Math.min(line.offsetTop - container.clientHeight * FOLLOW_POSITION_FRACTION, maxScroll),
    );
    if (reducedMotion) {
      container.scrollTop = target;
      return;
    }
    const controls = animate(container.scrollTop, target, {
      ...transition,
      onUpdate: (value) => {
        container.scrollTop = value;
      },
    });
    return () => controls.stop();
  }, [mode, currentIndex, reducedMotion, transition]);

  const isGutterTarget = (target: EventTarget | null) =>
    target instanceof Element && target.closest('[data-slot="lyrics-gutter"]') !== null;

  return {
    mode,
    containerRef,
    registerLine,
    jumpToCurrent,
    resetToFollow,
    containerHandlers: {
      onWheel: markUserScroll,
      onTouchStart: markUserScroll,
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        if (!isGutterTarget(event.target)) markUserScroll();
      },
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        if (SCROLL_INTENT_KEYS.has(event.key)) markUserScroll();
      },
      onPointerEnter: () => {
        pointerOver.current = true;
      },
      onPointerLeave: () => {
        pointerOver.current = false;
      },
    },
  };
}
