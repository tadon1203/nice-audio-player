/** The idle wait before free scrolling gives way to the lyrics, while the current line is in view. */
export const WAIT_IN_VIEW_MS = 2_000;
/** The same wait while the current line is out of view. */
export const WAIT_OUT_OF_VIEW_MS = 6_000;
/** A pointer resting on the lyrics (or a selection) holds the wait for at most this long. */
export const POINTER_REST_CAP_MS = 10_000;
/** When the next line change is at least this far away, the return does not wait for it. */
export const RETURN_WITHOUT_LINE_CHANGE_MS = 1_000;
/** A seek that moves the current line at most this many lines is still animated. */
export const MAX_ANIMATED_LINES = 3;

export type FollowMode = "follow" | "free";
/** How the list moves to a line: `fade` sets the position at once and fades the list in. */
export type ScrollHow = "instant" | "animate" | "fade";

/**
 * When the idle wait of a free reader is over. It counts from the last activity; while the pointer
 * rests on the lyrics or text is selected it is held, but only for `POINTER_REST_CAP_MS` of a
 * still pointer. The wait is longer while the current line is out of view.
 */
export function waitEndsAt({
  idleSince,
  pointerResting,
  currentInView,
}: {
  idleSince: number;
  pointerResting: boolean;
  currentInView: boolean;
}): number {
  const held = pointerResting ? POINTER_REST_CAP_MS : 0;
  return idleSince + held + (currentInView ? WAIT_IN_VIEW_MS : WAIT_OUT_OF_VIEW_MS);
}

/**
 * Whether the return happens as soon as the wait is over (rather than at the next line change):
 * when no line change is coming, or the next one is 1s or more away.
 */
export function returnsAtWaitEnd(msToNextLine: number | null): boolean {
  return msToNextLine === null || msToNextLine >= RETURN_WITHOUT_LINE_CHANGE_MS;
}

/** How a return from free scrolling moves: a glide within one viewport height, else a fade. */
export function returnScroll(distancePx: number, viewportPx: number): ScrollHow {
  return Math.abs(distancePx) <= viewportPx ? "animate" : "fade";
}

/** Whether the reader has brought the current line back to the anchor, within about one line. */
export function isNearAnchor(scrollTop: number, anchorTop: number, rowHeight: number): boolean {
  return Math.abs(scrollTop - anchorTop) <= rowHeight;
}

/**
 * What a change of the current line does to the lyrics scroll. How it moves is a fact about what
 * happened: the first line seen (opening the panel, a new track) sets the position at once; a
 * normal step to the next line animates, but only while following (and not while text is
 * selected) or once the idle wait is over; a seek, from wherever it came, returns to follow and
 * animates only when it moved a few lines. `scroll` is null when nothing should move.
 */
export function decideLineChange({
  previous,
  current,
  mode,
  now,
  waitEndsAt,
  selecting,
}: {
  previous: number | null;
  current: number;
  mode: FollowMode;
  now: number;
  /** When a free reader's idle wait is over (see `waitEndsAt`). */
  waitEndsAt: number;
  /** Text is selected in the lyrics: following pauses, without becoming free. */
  selecting: boolean;
}): { mode: FollowMode; scroll: ScrollHow | null } {
  if (previous === null) return { mode, scroll: "instant" };
  if (current === previous) return { mode, scroll: null };
  if (current === previous + 1) {
    if (mode === "follow") return { mode, scroll: selecting ? null : "animate" };
    if (now >= waitEndsAt) {
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
