import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { anchorScrollTop } from "./anchor-column";
import { createAnchorFollow } from "./anchor-follow.svelte";
import {
  decideLineChange,
  isNearAnchor,
  offscreenSide,
  returnScroll,
  returnsAtWaitEnd,
  waitEndsAt,
  type FollowMode,
  type OffscreenSide,
  type ScrollHow,
} from "./lyrics-follow-model";

/**
 * Follow/free auto-scroll for the lyrics panel. Follow keeps the centre of the current line 40%
 * from the top (the panel's spacers let the first and last lines reach it). What a line change
 * does is decided by `decideLineChange`; this moves the list: animated, set at once, or set at
 * once with the list faded in. Reduced motion always sets it at once.
 *
 * The list switches to free when it scrolls for a reason other than our own writes (wheel, drag,
 * scrollbar, keys); a plain click does not. Free shows `Jump to current line` while the current
 * line is out of view. Follow resumes on that button, on Esc, when the reader scrolls the current
 * line back to the anchor, or when the idle wait is over (at once, or at the next line change when
 * that is under 1s away, per `returnsAtWaitEnd`). The wait counts from the last activity and is
 * held while the pointer rests on the lyrics or text is selected. Selecting text while following
 * pauses auto-scroll without going free. Call it while a component initialises.
 */
export function createLyricsFollow(currentIndex: () => number, msToNextLine: () => number | null) {
  const lines = new Map<number, HTMLElement>();
  let mode = $state<FollowMode>("follow");
  let offscreen = $state.raw<OffscreenSide>(null);
  let idleSince = $state.raw(0);
  let pointerInside = $state.raw(false);
  let selecting = $state.raw(false);
  /** Whether the reader has scrolled the current line away from the anchor since going free. */
  let departed = false;
  let previousIndex: number | null = null;
  let container = $state.raw<HTMLElement | null>(null);
  const mover = createAnchorFollow();

  const scrollTo = (index: number, how: ScrollHow) => {
    const line = lines.get(index);
    if (line !== undefined) mover.scrollToRow(line, how);
  };

  /** Where the list is scrolled to when `line` sits on the anchor. */
  const anchorTarget = (element: HTMLElement, line: HTMLElement) =>
    anchorScrollTop({
      rowTop: line.offsetTop,
      rowHeight: line.offsetHeight,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    });

  const currentWaitEnd = () =>
    waitEndsAt({
      idleSince,
      pointerResting: pointerInside || selecting,
      currentInView: offscreen === null,
    });

  /** Back to the current line from free scrolling: a glide when it is near, else a fade. */
  const returnToCurrent = () => {
    mode = "follow";
    const index = untrack(currentIndex);
    const line = lines.get(index);
    const element = container;
    if (line === undefined || element === null) return;
    scrollTo(
      index,
      returnScroll(anchorTarget(element, line) - element.scrollTop, element.clientHeight),
    );
  };

  const onscroll = () => {
    const element = container;
    if (element === null || mover.isOwnScroll(element.scrollTop)) return;
    mover.stop();
    if (mode !== "free") {
      mode = "free";
      departed = false;
    }
    idleSince = Date.now();
    const line = lines.get(untrack(currentIndex));
    if (line === undefined) return;
    const near = isNearAnchor(element.scrollTop, anchorTarget(element, line), line.offsetHeight);
    if (!near) departed = true;
    else if (departed) mode = "follow";
  };

  // React to the current line changing, and only to that.
  $effect(() => {
    const current = currentIndex();
    untrack(() => {
      const wasFree = mode === "free";
      const decision = decideLineChange({
        previous: previousIndex,
        current,
        mode,
        now: Date.now(),
        waitEndsAt: currentWaitEnd(),
        selecting,
      });
      previousIndex = current;
      mode = decision.mode;
      if (decision.scroll === null) return;
      const line = lines.get(current);
      const element = container;
      if (wasFree && decision.mode === "follow" && decision.scroll === "animate") {
        if (line !== undefined && element !== null) {
          scrollTo(
            current,
            returnScroll(anchorTarget(element, line) - element.scrollTop, element.clientHeight),
          );
        }
        return;
      }
      scrollTo(current, decision.scroll);
    });
  });

  // While free, the idle wait ends at a time that moves with the activity; when it ends the list
  // returns unless a line change is about to do it.
  $effect(() => {
    if (mode !== "free") return;
    const endsAt = currentWaitEnd();
    const timer = setTimeout(
      () => {
        if (returnsAtWaitEnd(msToNextLine())) returnToCurrent();
      },
      Math.max(0, endsAt - Date.now()),
    );
    return () => clearTimeout(timer);
  });

  // Whether text is selected in the lyrics; any selection change counts as activity.
  $effect(() => {
    const element = container;
    if (element === null) return;
    const onChange = () => {
      const selection = document.getSelection();
      const inside =
        selection !== null &&
        !selection.isCollapsed &&
        selection.anchorNode !== null &&
        element.contains(selection.anchorNode);
      // A selection elsewhere on the page is not the reader's activity here.
      if (inside || selecting) idleSince = Date.now();
      selecting = inside;
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      selecting = false;
    };
  });

  // Following resumes when the selection that paused it clears.
  let wasSelecting = false;
  $effect(() => {
    const isSelecting = selecting;
    untrack(() => {
      if (wasSelecting && !isSelecting && mode === "follow") scrollTo(currentIndex(), "animate");
      wasSelecting = isSelecting;
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
    jumpToCurrent: returnToCurrent,
    /** The spacers changed size: keep the present on the anchor (only while following). */
    realign() {
      if (untrack(() => mode) === "follow") scrollTo(untrack(currentIndex), "instant");
    },
    onscroll,
    onpointerenter() {
      pointerInside = true;
    },
    onpointermove() {
      idleSince = Date.now();
    },
    onpointerleave() {
      pointerInside = false;
      idleSince = Date.now();
    },
    onkeydown(event: KeyboardEvent) {
      if (event.key === "Escape" && mode === "free") {
        event.stopPropagation();
        returnToCurrent();
      }
    },
  };
}
