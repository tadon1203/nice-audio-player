/** Manual scrolling gives way to the lyrics again on the next line change after this idle time. */
export const RETURN_TO_FOLLOW_MS = 3_000;
/** A seek that moves the current line at most this many lines is still animated. */
export const MAX_ANIMATED_LINES = 3;

export type FollowMode = "follow" | "free";
/** How the list moves to a line: `fade` sets the position at once and fades the list in. */
export type ScrollHow = "instant" | "animate" | "fade";

/**
 * What a change of the current line does to the lyrics scroll. How it moves is a fact about what
 * happened: the first line seen (opening the panel, a new track) sets the position at once; a
 * normal step to the next line animates, but only while following (or once the reader has been
 * idle for 3s); a seek, from wherever it came, returns to follow and animates only when it moved
 * a few lines. `scroll` is null when nothing should move.
 */
export function decideLineChange({
  previous,
  current,
  mode,
  now,
  lastInteractionAt,
}: {
  previous: number | null;
  current: number;
  mode: FollowMode;
  now: number;
  lastInteractionAt: number;
}): { mode: FollowMode; scroll: ScrollHow | null } {
  if (previous === null) return { mode, scroll: "instant" };
  if (current === previous) return { mode, scroll: null };
  if (current === previous + 1) {
    if (mode === "follow") return { mode, scroll: "animate" };
    if (now - lastInteractionAt >= RETURN_TO_FOLLOW_MS) {
      return { mode: "follow", scroll: "animate" };
    }
    return { mode, scroll: null };
  }
  return {
    mode: "follow",
    scroll: Math.abs(current - previous) <= MAX_ANIMATED_LINES ? "animate" : "fade",
  };
}

export type OffscreenSide = "above" | "below" | null;

/** Which side of the list a line is cut off on, from the two boxes (null when fully in view). */
export function offscreenSide(
  line: { top: number; bottom: number },
  list: { top: number; bottom: number },
): OffscreenSide {
  if (line.top >= list.top && line.bottom <= list.bottom) return null;
  return line.top < list.top ? "above" : "below";
}

const SCROLL_INTENT_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]);

/** Keys that mean the reader is scrolling by hand. */
export function isScrollIntentKey(key: string): boolean {
  return SCROLL_INTENT_KEYS.has(key);
}
