import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotionPreference } from "./use-reduced-motion-preference";
import {
  clampScrollTop,
  elementScrollTop,
  type ScrollAlignment,
} from "@/lib/scroll/scroll-geometry";

export type ScrollMode = "instant" | "smooth";
export interface ScrollRegion {
  element: HTMLElement | null;
  setViewportElement: (element: HTMLElement | null) => void;
  scrollToPosition: (top: number, mode?: ScrollMode) => void;
  scrollToElement: (target: HTMLElement, alignment: ScrollAlignment, mode?: ScrollMode) => void;
}
export interface ScrollRestorationRegistry {
  get: (key: string) => number | undefined;
  set: (key: string, value: number) => void;
}
function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

export function useScrollRegion(
  onUserScroll?: () => void,
  restoration?: { key: string; registry: ScrollRestorationRegistry },
): ScrollRegion {
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const pendingPosition = useRef<{ top: number; mode: ScrollMode } | null>(null);
  const restorationApplied = useRef(true);
  const pendingUserIntent = useRef(false);
  const reducedMotion = useReducedMotionPreference();
  const setViewportElement = useCallback(
    (element: HTMLElement | null) => {
      setViewport(element);
      if (!element) {
        restorationApplied.current = true;
        return;
      }
      const restored = restoration?.registry.get(restoration.key);
      restorationApplied.current = restored === undefined || restored === 0;
      const pending = pendingPosition.current;
      if (pending) {
        restorationApplied.current = true;
        element.scrollTo({
          top: clampScrollTop(element, pending.top),
          behavior: pending.mode === "smooth" && !reducedMotion ? "smooth" : "auto",
        });
        pendingPosition.current = null;
      }
    },
    [reducedMotion, restoration],
  );
  useLayoutEffect(() => {
    if (!viewport) return;
    const restored = restoration?.registry.get(restoration.key);
    let restorationFrames = 0;
    let restorationFrame = 0;
    let verificationFrames = 0;
    const verifyRestoration = () => {
      if (restored === undefined || verificationFrames >= 120) {
        restorationApplied.current = true;
        return;
      }
      verificationFrames += 1;
      if (Math.abs(viewport.scrollTop - restored) > 1) {
        restorationApplied.current = false;
        applyRestoration();
        return;
      }
      if (verificationFrames >= 120) {
        restorationApplied.current = true;
        return;
      }
      restorationFrame = requestAnimationFrame(verifyRestoration);
    };
    const applyRestoration = () => {
      if (restorationApplied.current || restored === undefined) return;
      if (restored > 0 && viewport.scrollHeight - viewport.clientHeight < restored) {
        if (restorationFrames < 120) {
          restorationFrames += 1;
          restorationFrame = requestAnimationFrame(applyRestoration);
        }
        return;
      }
      viewport.scrollTo({ top: restored, behavior: "auto" });
      restorationFrame = requestAnimationFrame(verifyRestoration);
    };
    applyRestoration();
    const onScroll = () => {
      applyRestoration();
      if (!restorationApplied.current) return;
      const saved = restoration?.registry.get(restoration.key);
      const programmaticReturnToSavedPosition =
        restoration?.key.startsWith("root:") &&
        saved !== undefined &&
        viewport.scrollTop < saved &&
        !pendingUserIntent.current;
      if (!programmaticReturnToSavedPosition)
        restoration?.registry.set(restoration.key, viewport.scrollTop);
      if (pendingUserIntent.current) {
        pendingUserIntent.current = false;
        onUserScroll?.();
      }
    };
    const markIntent = () => {
      pendingUserIntent.current = true;
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && event.deltaY !== 0) markIntent();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target === viewport) markIntent();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !isEditable(event.target) &&
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)
      )
        markIntent();
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("wheel", onWheel, { passive: true });
    viewport.addEventListener("touchmove", markIntent, { passive: true });
    viewport.addEventListener("pointerdown", onPointerDown, { passive: true });
    viewport.addEventListener("keydown", onKeyDown);
    const resizeObserver =
      restored === undefined || restorationApplied.current
        ? null
        : new ResizeObserver(applyRestoration);
    resizeObserver?.observe(viewport.firstElementChild ?? viewport);
    const mutationObserver =
      restored === undefined || restorationApplied.current
        ? null
        : new MutationObserver(applyRestoration);
    mutationObserver?.observe(viewport, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(restorationFrame);
      if (restoration && !restoration.key.startsWith("root:")) {
        const current = viewport.scrollTop;
        const saved = restoration.registry.get(restoration.key);
        if (saved === undefined || saved === 0 || current >= saved) {
          restoration.registry.set(restoration.key, current);
        }
      }
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchmove", markIntent);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("keydown", onKeyDown);
    };
  }, [onUserScroll, reducedMotion, restoration, viewport]);
  const scrollToPosition = useCallback(
    (top: number, mode: ScrollMode = "instant") => {
      if (!viewport) {
        pendingPosition.current = { top, mode };
        return;
      }
      viewport.scrollTo({
        top: clampScrollTop(viewport, top),
        behavior: mode === "smooth" && !reducedMotion ? "smooth" : "auto",
      });
    },
    [reducedMotion, viewport],
  );
  const scrollToElement = useCallback(
    (target: HTMLElement, alignment: ScrollAlignment, mode: ScrollMode = "instant") => {
      if (!viewport) return;
      scrollToPosition(elementScrollTop(viewport, target, alignment), mode);
    },
    [scrollToPosition, viewport],
  );
  return { element: viewport, setViewportElement, scrollToPosition, scrollToElement };
}
