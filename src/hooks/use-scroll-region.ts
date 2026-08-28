import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
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
function isExitingSurface(viewport: HTMLElement) {
  return (
    viewport.dataset.scrollSurfaceExiting === "true" ||
    viewport.closest('[data-state="exiting"]') !== null
  );
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
  const pendingUserIntent = useRef(false);
  const reducedMotion = useReducedMotion();
  useLayoutEffect(() => {
    if (!viewport) return;
    const restored = restoration?.registry.get(restoration.key);
    const pending = pendingPosition.current;
    let restorationApplied = restored === undefined;
    const applyRestoration = () => {
      if (
        restorationApplied ||
        restored === undefined ||
        viewport.scrollHeight <= viewport.clientHeight
      )
        return;
      viewport.scrollTo({ top: clampScrollTop(viewport, restored), behavior: "auto" });
      restorationApplied = true;
    };
    applyRestoration();
    if (pending) {
      viewport.scrollTo({
        top: clampScrollTop(viewport, pending.top),
        behavior: pending.mode === "smooth" && !reducedMotion ? "smooth" : "auto",
      });
      pendingPosition.current = null;
    }
    const onScroll = () => {
      applyRestoration();
      if (!restorationApplied) return;
      if (isExitingSurface(viewport)) return;
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
      restored === undefined || restorationApplied ? null : new ResizeObserver(applyRestoration);
    resizeObserver?.observe(viewport.firstElementChild ?? viewport);
    const mutationObserver =
      restored === undefined || restorationApplied ? null : new MutationObserver(applyRestoration);
    mutationObserver?.observe(viewport, { childList: true, subtree: true });
    return () => {
      if (!isExitingSurface(viewport)) {
        restoration?.registry.set(restoration.key, viewport.scrollTop);
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
  return { element: viewport, setViewportElement: setViewport, scrollToPosition, scrollToElement };
}
