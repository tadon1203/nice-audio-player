import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { createScrollRegionController, type ScrollMode } from "@/lib/scroll/scroll-region";
import type { ScrollAlignment } from "@/lib/scroll/scroll-geometry";

export interface ScrollRegion {
  element: HTMLElement | null;
  setViewportElement: (element: HTMLElement | null) => void;
  setContentElement: (element: HTMLElement | null) => void;
  scrollToPosition: (top: number, mode?: ScrollMode) => void;
  scrollToElement: (target: HTMLElement, alignment: ScrollAlignment, mode?: ScrollMode) => void;
  cancel: () => void;
}

/** Owns one semantic viewport, its Lenis instance, and its programmatic movement policy. */
export function useScrollRegion(onUserScroll?: () => void): ScrollRegion {
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const [content, setContent] = useState<HTMLElement | null>(null);
  const controllerRef = useRef<ReturnType<typeof createScrollRegionController> | null>(null);
  const reducedMotion = useReducedMotion();
  useLayoutEffect(() => {
    if (!viewport || !content) return;
    const next = createScrollRegionController(
      viewport,
      content,
      onUserScroll,
      Boolean(reducedMotion),
    );
    controllerRef.current = next;
    return () => {
      next.destroy();
      if (controllerRef.current === next) controllerRef.current = null;
    };
  }, [content, onUserScroll, reducedMotion, viewport]);
  const scrollToPosition = useCallback(
    (top: number, mode: ScrollMode = "instant") =>
      controllerRef.current?.scrollToPosition(top, mode),
    [],
  );
  const scrollToElement = useCallback(
    (target: HTMLElement, alignment: ScrollAlignment, mode: ScrollMode = "instant") =>
      controllerRef.current?.scrollToElement(target, alignment, mode),
    [],
  );
  return {
    element: viewport,
    setViewportElement: setViewport,
    setContentElement: setContent,
    scrollToPosition,
    scrollToElement,
    cancel: () => controllerRef.current?.interrupt(),
  };
}
