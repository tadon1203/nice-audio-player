import type { Attachment } from "svelte/attachments";
import { prefersReducedMotion } from "svelte/motion";
import { SpringCurve } from "./spring-curve";
import { SvelteMotion } from "./svelte-motion";

/*
 * Shared elements: the same Sleeve on two screens, and it moves from one to the other. Not the
 * View Transitions API: it ignores input during the transition and cannot be interrupted.
 * Both ends mark their element with `SharedElement.attach(key)`. The one that goes away remembers
 * where it was; the one that appears flies in from there. The flight is a clone drawn over the
 * page, placed at the destination and moved with `transform`, so it is interruptible (going back
 * mid-flight departs from wherever the clone is) and does not depend on any scroll region.
 */

export const sharedKey = {
  /** The Sleeve between the dock and Now Playing. */
  sleeve: "now-playing-sleeve",
};

/** The Sleeve's corner radius at both ends, so the flight between them keeps its corners. */
export const SLEEVE_RADIUS = "6px";

/** A place on screen: viewport position and size in px, and the corner radius at that size. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/** A departure is for the screen that appears right after; later than this it is forgotten. */
export const DEPARTURE_TTL_MS = 1000;

interface Flight {
  box: () => Box;
  cancel: () => void;
}

function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect();
  const radius = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
  // `rounded-full` computes to a huge value; a corner never exceeds half the side.
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    radius: Math.min(radius, Math.min(rect.width, rect.height) / 2),
  };
}

function isInView(box: Box): boolean {
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.x < window.innerWidth &&
    box.x + box.width > 0 &&
    box.y < window.innerHeight &&
    box.y + box.height > 0
  );
}

/** The translation currently applied by the element's ancestors' transforms. */
function ancestorTranslation(node: Element): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  for (let parent = node.parentElement; parent !== null; parent = parent.parentElement) {
    const { transform } = getComputedStyle(parent);
    if (transform === "none") continue;
    const matrix = new DOMMatrix(transform);
    dx += matrix.m41;
    dy += matrix.m42;
  }
  return { dx, dy };
}

/**
 * What outlives a screen change: where each shared element last was, and the flights in the air.
 * One screen leaves and another arrives, so the two ends can only meet in state both can reach.
 */
class FlightRegistry {
  readonly #departures = new Map<string, { box: Box; at: number }>();
  readonly #flights = new Map<string, Flight>();

  /** Remembers where the element is: the clone if it is mid-flight, else the element's last box. */
  public leave(key: string, lastBox: Box): void {
    const flight = this.#flights.get(key);
    const box = flight ? flight.box() : lastBox;
    flight?.cancel();
    this.#departures.set(key, { box, at: performance.now() });
  }

  public arrive(key: string, node: HTMLElement): void {
    const departure = this.#departures.get(key);
    this.#departures.delete(key);
    if (!departure || !SharedElement.isFresh(departure.at, performance.now())) return;

    const { duration, easing } = SvelteMotion.of("large");

    // Under reduced motion nothing travels: the Sleeve appears with a brief crossfade.
    if (prefersReducedMotion.current) {
      node.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: SpringCurve.linear });
      return;
    }

    // Where the element will rest: a layer still lifting into place (Now Playing) is offset by
    // its transform right now, which the flight must not land on.
    const { dx, dy } = ancestorTranslation(node);
    const measured = boxOf(node);
    const to = { ...measured, x: measured.x - dx, y: measured.y - dy };
    if (!isInView(departure.box) || !isInView(to)) return;
    // Already there (the loading header handing over to the loaded one): nothing to fly.
    if (Math.abs(departure.box.x - to.x) < 1 && Math.abs(departure.box.y - to.y) < 1) return;

    const ghost = node.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("id");
    ghost.dataset.sharedElement = "flying";
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${to.x}px`,
      top: `${to.y}px`,
      width: `${to.width}px`,
      height: `${to.height}px`,
      maxWidth: "none",
      margin: "0",
      zIndex: "60",
      pointerEvents: "none",
      transformOrigin: "0 0",
    });
    node.style.visibility = "hidden";
    document.body.append(ghost);

    const animation = ghost.animate(SharedElement.flightKeyframes(departure.box, to, easing), {
      duration,
      fill: "forwards",
    });
    const finish = (): void => {
      ghost.remove();
      node.style.visibility = "";
      this.#flights.delete(key);
    };
    this.#flights.set(key, {
      box: () => {
        const rect = ghost.getBoundingClientRect();
        const scale = to.width > 0 ? rect.width / to.width : 1;
        const radius = Number.parseFloat(getComputedStyle(ghost).borderTopLeftRadius) || 0;
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          radius: radius * scale,
        };
      },
      cancel: () => {
        animation.cancel();
        finish();
      },
    });
    void animation.finished.then(finish, () => {});
  }
}

const registry = new FlightRegistry();

/** One end of a shared element: the Sleeve on two screens, flown between them. */
export class SharedElement {
  /**
   * Marks an element as one end of a shared element. On mount it flies in from where the other
   * end last was (if that was just now); on destroy it records where it was for the other end.
   */
  public static attach(key: string): Attachment<HTMLElement> {
    return (node) => {
      // A node hidden by an earlier departure (it stayed connected) shows again.
      node.style.visibility = "";
      registry.arrive(key, node);
      // By the time this runs on destroy the element is already out of the document and has no
      // box, so keep the last one seen: refreshed before whatever starts a navigation.
      let lastBox = boxOf(node);
      const refresh = (): void => {
        if (node.isConnected) lastBox = boxOf(node);
      };
      const events = ["pointerdown", "keydown", "click"] as const;
      for (const type of events) window.addEventListener(type, refresh, { capture: true });
      return () => {
        for (const type of events) window.removeEventListener(type, refresh, { capture: true });
        // An element kept on screen while its layer fades out would be a second copy of the
        // Sleeve next to the one flying to the other end.
        refresh();
        if (node.isConnected) node.style.visibility = "hidden";
        registry.leave(key, lastBox);
      };
    };
  }

  /** Linear interpolation between two boxes. Calculations only. */
  public static lerpBox(from: Box, to: Box, t: number): Box {
    const lerp = (a: number, b: number): number => a + (b - a) * t;
    return {
      x: lerp(from.x, to.x),
      y: lerp(from.y, to.y),
      width: lerp(from.width, to.width),
      height: lerp(from.height, to.height),
      radius: lerp(from.radius, to.radius),
    };
  }

  /**
   * The flight as keyframes for an element laid out at `to`. Position and size are a `transform`;
   * a scale would stretch the corners, so the radius is set in the element's own units to come out
   * as the interpolated radius on screen.
   */
  public static flightKeyframes(
    from: Box,
    to: Box,
    easing: (t: number) => number,
    steps = 24,
  ): Keyframe[] {
    return Array.from({ length: steps + 1 }, (_, index) => {
      const box = SharedElement.lerpBox(from, to, easing(index / steps));
      const scale = to.width > 0 ? box.width / to.width : 1;
      return {
        transform: `translate(${box.x - to.x}px, ${box.y - to.y}px) scale(${scale})`,
        borderRadius: `${scale > 0 ? box.radius / scale : box.radius}px`,
      };
    });
  }

  /** Whether a departure at `departedAt` is still fresh at `now`. */
  public static isFresh(departedAt: number, now: number): boolean {
    return now - departedAt <= DEPARTURE_TTL_MS;
  }
}
