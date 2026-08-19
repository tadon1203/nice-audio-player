import Lenis from "lenis";
import { clampScrollTop, elementScrollTop, type ScrollAlignment } from "./scroll-geometry";
import { registerLenis } from "./frame";

export type ScrollMode = "instant" | "smooth";
export interface ScrollRegionHandle {
  readonly element: HTMLElement;
  scrollToPosition: (top: number, mode?: ScrollMode) => void;
  scrollToElement: (target: HTMLElement, alignment: ScrollAlignment, mode?: ScrollMode) => void;
  interrupt: () => void;
  destroy: () => void;
}

export function createScrollRegionController(
  element: HTMLElement,
  content: HTMLElement,
  onUserScroll?: () => void,
  reducedMotion = false,
): ScrollRegionHandle {
  let destroyed = false;
  let nextOperation = 0;
  let userIntent = false;
  let activeOperation: { id: number } | null = null;
  let pendingProgrammaticPosition: number | null = null;
  const invalidateProgrammaticOperation = () => {
    nextOperation += 1;
    activeOperation = null;
  };
  const lenis = new Lenis({
    wrapper: element,
    content,
    eventsTarget: element,
    orientation: "vertical",
    smoothWheel: !reducedMotion,
    syncTouch: false,
    lerp: 0.1,
    wheelMultiplier: 1,
    touchMultiplier: 1,
    autoRaf: false,
    respectReducedMotion: reducedMotion,
    // Lenis invokes this while handling wheel/touch input and before it starts
    // its own user-owned scroll. Clearing only our operation lets that input
    // replace a programmatic trip without cancelling the input itself.
    virtualScroll: ({ deltaY, event }) => {
      if ((event.type === "wheel" && (event.ctrlKey || deltaY === 0)) || destroyed) return true;
      userIntent = true;
      invalidateProgrammaticOperation();
      return true;
    },
  });
  const unregister = registerLenis(lenis);
  const interrupt = () => {
    invalidateProgrammaticOperation();
    lenis.stop();
    lenis.start();
  };
  const directIntent = () => {
    userIntent = true;
    interrupt();
  };
  const scrollKeys = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
  const isEditable = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  const onScroll = () => {
    if (activeOperation) return;
    if (
      pendingProgrammaticPosition !== null &&
      Math.abs(element.scrollTop - pendingProgrammaticPosition) < 0.5
    ) {
      pendingProgrammaticPosition = null;
      return;
    }
    pendingProgrammaticPosition = null;
    if (userIntent) {
      userIntent = false;
      onUserScroll?.();
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isEditable(event.target) && scrollKeys.has(event.key)) directIntent();
  };
  element.addEventListener("pointerdown", directIntent, { passive: true });
  element.addEventListener("touchstart", directIntent, { passive: true });
  element.addEventListener("keydown", onKeyDown);
  element.addEventListener("scroll", onScroll, { passive: true });
  const scrollToPosition = (top: number, mode: ScrollMode = "instant") => {
    if (destroyed) return;
    const id = ++nextOperation;
    const immediate = reducedMotion || mode === "instant";
    const target = clampScrollTop(element, top);
    activeOperation = { id };
    if (immediate) pendingProgrammaticPosition = target;
    lenis.scrollTo(target, {
      immediate,
      onComplete: () => {
        if (!destroyed && activeOperation?.id === id) activeOperation = null;
      },
    });
    if (immediate && activeOperation?.id === id) activeOperation = null;
  };
  return {
    element,
    scrollToPosition,
    scrollToElement: (target, alignment, mode) =>
      scrollToPosition(elementScrollTop(element, target, alignment), mode),
    interrupt,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      nextOperation += 1;
      activeOperation = null;
      pendingProgrammaticPosition = null;
      unregister();
      lenis.destroy();
      element.removeEventListener("pointerdown", directIntent);
      element.removeEventListener("touchstart", directIntent);
      element.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("scroll", onScroll);
    },
  };
}
