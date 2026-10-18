export type FollowMode = "follow" | "free";
/** How the list moves to a line: `fade` sets the position at once and fades the list in. */
export type ScrollHow = "instant" | "animate" | "fade";
export type OffscreenSide = "above" | "below" | null;

/** The rules that decide when the lyrics follow the playback and when a free reader returns. */
export class LyricsFollowRules {
  /** The idle wait before free scrolling gives way to the lyrics, while the current line is in view. */
  public static readonly waitInViewMs = 2_000;
  /** The same wait while the current line is out of view. */
  public static readonly waitOutOfViewMs = 6_000;
  /** A pointer resting on the lyrics (or a selection) holds the wait for at most this long. */
  public static readonly pointerRestCapMs = 10_000;
  /** When the next line change is at least this far away, the return does not wait for it. */
  public static readonly returnWithoutLineChangeMs = 1_000;
  /** A seek that moves the current line at most this many lines is still animated. */
  public static readonly maxAnimatedLines = 3;

  /**
   * When the idle wait of a free reader is over. It counts from the last activity; while the pointer
   * rests on the lyrics or text is selected it is held, but only for `pointerRestCapMs` of a
   * still pointer. The wait is longer while the current line is out of view.
   */
  public static waitEndsAt({
    idleSince,
    pointerResting,
    currentInView,
  }: {
    idleSince: number;
    pointerResting: boolean;
    currentInView: boolean;
  }): number {
    const held = pointerResting ? LyricsFollowRules.pointerRestCapMs : 0;
    return (
      idleSince +
      held +
      (currentInView ? LyricsFollowRules.waitInViewMs : LyricsFollowRules.waitOutOfViewMs)
    );
  }

  /**
   * Whether the return happens as soon as the wait is over (rather than at the next line change):
   * when no line change is coming, or the next one is 1s or more away.
   */
  public static returnsAtWaitEnd(msToNextLine: number | null): boolean {
    return msToNextLine === null || msToNextLine >= LyricsFollowRules.returnWithoutLineChangeMs;
  }

  /** How a return from free scrolling moves: a glide within one viewport height, else a fade. */
  public static returnScroll(distancePx: number, viewportPx: number): ScrollHow {
    return Math.abs(distancePx) <= viewportPx ? "animate" : "fade";
  }

  /** Whether the reader has brought the current line back to the anchor, within about one line. */
  public static isNearAnchor(scrollTop: number, anchorTop: number, rowHeight: number): boolean {
    return Math.abs(scrollTop - anchorTop) <= rowHeight;
  }

  /**
   * What a change of the current line does to the lyrics scroll. How it moves is a fact about what
   * happened: the first line seen (opening the panel, a new track) sets the position at once; a
   * normal step to the next line animates, but only while following (and not while text is
   * selected) or once the idle wait is over; a seek, from wherever it came, returns to follow and
   * animates only when it moved a few lines. `scroll` is null when nothing should move.
   */
  public static decideLineChange({
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
      scroll:
        Math.abs(current - previous) <= LyricsFollowRules.maxAnimatedLines ? "animate" : "fade",
    };
  }

  /** Which side of the list a line is cut off on, from the two boxes (null when fully in view). */
  public static offscreenSide(
    line: { top: number; bottom: number },
    list: { top: number; bottom: number },
  ): OffscreenSide {
    if (line.top >= list.top && line.bottom <= list.bottom) return null;
    return line.top < list.top ? "above" : "below";
  }
}
