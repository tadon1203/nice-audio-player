import { useCallback, useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { createScrollAnimationController, type ScrollMode } from "@/lib/scroll/animate-scroll";
import { elementScrollTop, type ScrollAlignment } from "@/lib/scroll/scroll-geometry";

const scrollKeys = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
function isEditable(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

export function useScrollController(element: HTMLElement | null, onUserScroll?: () => void) {
  const controllerRef = useRef<ReturnType<typeof createScrollAnimationController> | null>(null);
  const userIntent = useRef(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!element) return;
    const controller = createScrollAnimationController(element);
    controllerRef.current = controller;
    const cancelForUser = () => {
      userIntent.current = true;
      controller.cancel();
    };
    const onScroll = () => {
      if (controller.programmatic) {
        if (!controller.active) controller.finalizeProgrammaticDelivery();
        return;
      }
      if (userIntent.current) {
        userIntent.current = false;
        onUserScroll?.();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isEditable(event.target) && scrollKeys.has(event.key)) cancelForUser();
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    element.addEventListener("wheel", cancelForUser, { passive: true });
    element.addEventListener("touchstart", cancelForUser, { passive: true });
    element.addEventListener("pointerdown", cancelForUser, { passive: true });
    element.addEventListener("keydown", onKeyDown);
    return () => {
      controller.cancel();
      userIntent.current = false;
      controllerRef.current = null;
      element.removeEventListener("scroll", onScroll);
      element.removeEventListener("wheel", cancelForUser);
      element.removeEventListener("touchstart", cancelForUser);
      element.removeEventListener("pointerdown", cancelForUser);
      element.removeEventListener("keydown", onKeyDown);
    };
  }, [element, onUserScroll]);
  const scrollToPosition = useCallback(
    (top: number, mode: ScrollMode = "instant") => {
      if (!element || !controllerRef.current) return;
      userIntent.current = false;
      controllerRef.current.scrollTo(top, reducedMotion ? "instant" : mode);
    },
    [element, reducedMotion],
  );
  const scrollToElement = useCallback(
    (target: HTMLElement, alignment: ScrollAlignment, mode: ScrollMode = "instant") => {
      if (!element) return;
      scrollToPosition(elementScrollTop(element, target, alignment), mode);
    },
    [element, scrollToPosition],
  );
  const cancel = useCallback(() => controllerRef.current?.cancel(), []);
  return { scrollToPosition, scrollToElement, cancel, active: false };
}
