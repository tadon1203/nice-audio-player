import type { Attachment } from "svelte/attachments";
import { AppServices } from "#lib/app/app-services.svelte";
import { RetargetableSpring } from "#lib/ui/motion/retargetable-spring.svelte";
import { SpringCurve } from "#lib/ui/motion/spring-curve";
import { crossfade, motionTokens } from "#lib/ui/motion/tokens";
import { AnchorColumn } from "./anchor-column";
import type { ScrollHow } from "./lyrics-follow-rules";

const FADE_MS = crossfade.duration;
/** The glide ends this close to its target. */
const GLIDE_END_PX = 0.5;
/** A scroll position further than this from what the glide wrote was moved by something else. */
const GLIDE_INTERRUPT_PX = 1;
/** How many of the follower's own recent writes to `scrollTop` it remembers. */
const OWN_WRITES = 8;

/**
 * Moves a scroll container so a row's centre sits on the anchor line (40% from the top): animated
 * (a spring written to `scrollTop`, retargeted by every call with its velocity kept), set at
 * once, or set at once with the list faded in. Reduced motion always sets it at once. Shared by
 * the lyrics and the queue. Construct it while a component initialises.
 * A glide lets go when something else moves the list (the wheel, the scrollbar, the browser
 * clamping it). `isOwnScroll` tells a scroll event caused by its own writes from the reader's.
 */
export class AnchorFollow {
  readonly #budget = AppServices.current().motion;
  #container = $state.raw<HTMLElement | null>(null);
  #fade: Animation | null = null;
  // The scroll position as a spring. It is written to the container only while a glide is active.
  readonly #glide = new RetargetableSpring(0, {
    precision: GLIDE_END_PX,
    duration: motionTokens.move.duration,
  });
  #gliding = $state(false);
  /** The value last written to `scrollTop` by the glide, to tell whether something else moved it. */
  #lastWritten: number | null = null;
  /** The last few values the follower wrote to `scrollTop`. */
  readonly #written: number[] = [];

  public constructor() {
    // The glide reads a spring that moves on animation frames and writes it to `scrollTop`. Nothing
    // in the DOM can express that as an attachment, so it stays an effect.
    $effect(() => {
      const element = this.#container;
      if (!this.#gliding || element === null) return;
      const value = this.#glide.current;
      const goal = this.#glide.target;
      if (
        this.#lastWritten !== null &&
        Math.abs(element.scrollTop - this.#lastWritten) > GLIDE_INTERRUPT_PX
      ) {
        this.#gliding = false;
        return;
      }
      // Close enough: land exactly on the target and stop.
      if (Math.abs(value - goal) < GLIDE_END_PX) {
        this.#write(element, goal);
        this.#gliding = false;
        return;
      }
      this.#write(element, value);
      this.#lastWritten = value;
    });

    $effect(() => this.stop);
  }

  /** The scroll container. */
  public readonly attach: Attachment<HTMLElement> = (node) => {
    this.#container = node;
    return () => {
      if (this.#container === node) this.#container = null;
    };
  };

  public readonly stop = (): void => {
    this.#fade?.cancel();
    this.#fade = null;
    this.#glide.stop();
    this.#gliding = false;
  };

  /** Whether a scroll position is one the follower wrote itself (so not the reader's doing). */
  public isOwnScroll(scrollTop: number): boolean {
    return this.#written.some((value) => Math.abs(scrollTop - value) <= GLIDE_INTERRUPT_PX);
  }

  /** Brings `row` to the anchor line. Does nothing before the container is mounted. */
  public scrollToRow(row: HTMLElement, how: ScrollHow): void {
    const element = this.#container;
    if (element === null) return;
    this.stop();
    const target = AnchorColumn.scrollTop({
      rowTop: row.offsetTop,
      rowHeight: row.offsetHeight,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    });
    const reduced = this.#budget.current === "reduced";
    if (reduced || how !== "animate") {
      this.#write(element, target);
      if (how === "fade" && !reduced) {
        this.#fade = element.animate(
          { opacity: [0, 1] },
          { duration: FADE_MS, easing: SpringCurve.linear },
        );
      }
      return;
    }
    this.#glide.set(element.scrollTop, { instant: true });
    this.#glide.set(target);
    this.#lastWritten = null;
    this.#gliding = true;
  }

  #write(element: HTMLElement, value: number): void {
    element.scrollTop = value;
    this.#written.push(value);
    if (this.#written.length > OWN_WRITES) this.#written.shift();
  }
}
