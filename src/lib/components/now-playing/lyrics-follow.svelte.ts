import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import { AnchorColumn } from "./anchor-column";
import { AnchorFollow } from "./anchor-follow.svelte";
import {
  LyricsFollowRules,
  type FollowMode,
  type OffscreenSide,
  type ScrollHow,
} from "./lyrics-follow-rules";

/**
 * Follow/free auto-scroll for the lyrics panel. Follow keeps the centre of the current line 40%
 * from the top (the panel's spacers let the first and last lines reach it). What a line change
 * does is decided by `LyricsFollowRules.decideLineChange`; this moves the list: animated, set at
 * once, or set at once with the list faded in. Reduced motion always sets it at once.
 *
 * The list switches to free when it scrolls for a reason other than our own writes (wheel, drag,
 * scrollbar, keys); a plain click does not. Free shows `Jump to current line` while the current
 * line is out of view. Follow resumes on that button, on Esc, when the reader scrolls the current
 * line back to the anchor, or when the idle wait is over (at once, or at the next line change when
 * that is under 1s away, per `returnsAtWaitEnd`). The wait counts from the last activity and is
 * held while the pointer rests on the lyrics or text is selected. Selecting text while following
 * pauses auto-scroll without going free. Construct it while a component initialises.
 */
export class LyricsFollow {
  readonly #currentIndex: () => number;
  readonly #msToNextLine: () => number | null;
  readonly #lines = new Map<number, HTMLElement>();
  #mode = $state<FollowMode>("follow");
  #offscreen = $state.raw<OffscreenSide>(null);
  #idleSince = $state.raw(0);
  #pointerInside = $state.raw(false);
  #selecting = $state.raw(false);
  /** Whether the reader has scrolled the current line away from the anchor since going free. */
  #departed = false;
  #previousIndex: number | null = null;
  #container = $state.raw<HTMLElement | null>(null);
  #wasSelecting = false;
  readonly #mover = new AnchorFollow();

  public constructor(currentIndex: () => number, msToNextLine: () => number | null) {
    this.#currentIndex = currentIndex;
    this.#msToNextLine = msToNextLine;

    // React to the current line changing, and only to that.
    $effect(() => {
      const current = currentIndex();
      untrack(() => {
        const wasFree = this.#mode === "free";
        const decision = LyricsFollowRules.decideLineChange({
          previous: this.#previousIndex,
          current,
          mode: this.#mode,
          now: Date.now(),
          waitEndsAt: this.#currentWaitEnd(),
          selecting: this.#selecting,
        });
        this.#previousIndex = current;
        this.#mode = decision.mode;
        if (decision.scroll === null) return;
        const line = this.#lines.get(current);
        const element = this.#container;
        if (wasFree && decision.mode === "follow" && decision.scroll === "animate") {
          if (line !== undefined && element !== null) {
            this.#scrollTo(
              current,
              LyricsFollowRules.returnScroll(
                this.#anchorTarget(element, line) - element.scrollTop,
                element.clientHeight,
              ),
            );
          }
          return;
        }
        this.#scrollTo(current, decision.scroll);
      });
    });

    // While free, the idle wait ends at a time that moves with the activity; when it ends the list
    // returns unless a line change is about to do it. A timer is an external source, so it is an effect.
    $effect(() => {
      if (this.#mode !== "free") return;
      const endsAt = this.#currentWaitEnd();
      const timer = setTimeout(
        () => {
          if (LyricsFollowRules.returnsAtWaitEnd(this.#msToNextLine())) this.#returnToCurrent();
        },
        Math.max(0, endsAt - Date.now()),
      );
      return (): void => clearTimeout(timer);
    });

    // Whether text is selected in the lyrics; any selection change counts as activity. The listener
    // writes state on each change, so it stays an effect rather than a derived subscription.
    $effect(() => {
      const element = this.#container;
      if (element === null) return;
      const onChange = (): void => {
        const selection = document.getSelection();
        const inside =
          selection !== null &&
          !selection.isCollapsed &&
          selection.anchorNode !== null &&
          element.contains(selection.anchorNode);
        // A selection elsewhere on the page is not the reader's activity here.
        if (inside || this.#selecting) this.#idleSince = Date.now();
        this.#selecting = inside;
      };
      document.addEventListener("selectionchange", onChange);
      return (): void => {
        document.removeEventListener("selectionchange", onChange);
        this.#selecting = false;
      };
    });

    // Following resumes when the selection that paused it clears.
    $effect(() => {
      const isSelecting = this.#selecting;
      untrack(() => {
        if (this.#wasSelecting && !isSelecting && this.#mode === "follow") {
          this.#scrollTo(currentIndex(), "animate");
        }
        this.#wasSelecting = isSelecting;
      });
    });

    // Which side the current line is off-screen on, while the reader is free. The intersection
    // observer is an external source that needs the element at setup, so it stays an effect.
    $effect(() => {
      const element = this.#container;
      const index = currentIndex();
      const line = untrack(() => this.#lines.get(index));
      if (this.#mode !== "free" || element === null || line === undefined) {
        this.#offscreen = null;
        return;
      }
      if (typeof IntersectionObserver === "undefined") {
        this.#offscreen = "below";
        return;
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry === undefined) return;
          if (entry.isIntersecting && entry.intersectionRatio >= 1) {
            this.#offscreen = null;
            return;
          }
          const list = entry.rootBounds ?? element.getBoundingClientRect();
          this.#offscreen =
            LyricsFollowRules.offscreenSide(entry.boundingClientRect, list) ?? "below";
        },
        { root: element, threshold: 1 },
      );
      observer.observe(line);
      return (): void => observer.disconnect();
    });
  }

  public get mode(): FollowMode {
    return this.#mode;
  }

  public get offscreen(): OffscreenSide {
    return this.#offscreen;
  }

  /** The scroll container. */
  public readonly container: Attachment<HTMLElement> = (node) => {
    this.#container = node;
    const detach = this.#mover.attach(node);
    return () => {
      detach?.();
      if (this.#container === node) this.#container = null;
    };
  };

  /** One line's element: registers it so the list can scroll to it. */
  public line(index: number): Attachment<HTMLElement> {
    return (node) => {
      this.#lines.set(index, node);
      return () => {
        if (this.#lines.get(index) === node) this.#lines.delete(index);
      };
    };
  }

  /** Back to the current line from the "Jump to current line" button. */
  public readonly jumpToCurrent = (): void => {
    this.#returnToCurrent();
  };

  /** The spacers changed size: keep the present on the anchor (only while following). */
  public realign(): void {
    if (untrack(() => this.#mode) === "follow") {
      this.#scrollTo(untrack(this.#currentIndex), "instant");
    }
  }

  public readonly onscroll = (): void => {
    const element = this.#container;
    if (element === null || this.#mover.isOwnScroll(element.scrollTop)) return;
    this.#mover.stop();
    if (this.#mode !== "free") {
      this.#mode = "free";
      this.#departed = false;
    }
    this.#idleSince = Date.now();
    const line = this.#lines.get(untrack(this.#currentIndex));
    if (line === undefined) return;
    const near = LyricsFollowRules.isNearAnchor(
      element.scrollTop,
      this.#anchorTarget(element, line),
      line.offsetHeight,
    );
    if (!near) this.#departed = true;
    else if (this.#departed) this.#mode = "follow";
  };

  public readonly onpointerenter = (): void => {
    this.#pointerInside = true;
  };

  public readonly onpointermove = (): void => {
    this.#idleSince = Date.now();
  };

  public readonly onpointerleave = (): void => {
    this.#pointerInside = false;
    this.#idleSince = Date.now();
  };

  public readonly onkeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.#mode === "free") {
      event.stopPropagation();
      this.#returnToCurrent();
    }
  };

  #scrollTo(index: number, how: ScrollHow): void {
    const line = this.#lines.get(index);
    if (line !== undefined) this.#mover.scrollToRow(line, how);
  }

  /** Where the list is scrolled to when `line` sits on the anchor. */
  #anchorTarget(element: HTMLElement, line: HTMLElement): number {
    return AnchorColumn.scrollTop({
      rowTop: line.offsetTop,
      rowHeight: line.offsetHeight,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    });
  }

  #currentWaitEnd(): number {
    return LyricsFollowRules.waitEndsAt({
      idleSince: this.#idleSince,
      pointerResting: this.#pointerInside || this.#selecting,
      currentInView: this.#offscreen === null,
    });
  }

  /** Back to the current line from free scrolling: a glide when it is near, else a fade. */
  #returnToCurrent(): void {
    this.#mode = "follow";
    const index = untrack(this.#currentIndex);
    const line = this.#lines.get(index);
    const element = this.#container;
    if (line === undefined || element === null) return;
    this.#scrollTo(
      index,
      LyricsFollowRules.returnScroll(
        this.#anchorTarget(element, line) - element.scrollTop,
        element.clientHeight,
      ),
    );
  }
}
