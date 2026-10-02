import type { Attachment } from "svelte/attachments";
import { motionFor } from "./svelte-motion";

/*
 * Shared elements (ADR 0004): the same Sleeve on two screens, and it moves from one to the other.
 * Both ends mark their element with `sharedElement(key)`. The one that goes away remembers where
 * it was; the one that appears flies in from there. The flight is a clone drawn over the page,
 * placed at the destination and moved with `transform`, so it is interruptible (going back mid-
 * flight departs from wherever the clone is) and does not depend on any scroll region.
 */

export const sharedKey = {
  /** The Sleeve between the dock and Now Playing. */
  sleeve: "now-playing-sleeve",
};

/** The Sleeve's corner radius at both ends, so the flight between them keeps its corners. */
export const SLEEVE_RADIUS = "6px";

/** A place on screen: viewport position and size in px, and the corner radius at that size. */
export type Box = { x: number; y: number; width: number; height: number; radius: number };

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export function lerpBox(from: Box, to: Box, t: number): Box {
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    width: lerp(from.width, to.width, t),
    height: lerp(from.height, to.height, t),
    radius: lerp(from.radius, to.radius, t),
  };
}

/**
 * The flight as keyframes for an element laid out at `to`. Position and size are a `transform`;
 * a scale would stretch the corners, so the radius is set in the element's own units to come out
 * as the interpolated radius on screen.
 */
export function flightKeyframes(
  from: Box,
  to: Box,
  easing: (t: number) => number,
  steps = 24,
): Keyframe[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const box = lerpBox(from, to, easing(index / steps));
    const scale = to.width > 0 ? box.width / to.width : 1;
    return {
      transform: `translate(${box.x - to.x}px, ${box.y - to.y}px) scale(${scale})`,
      borderRadius: `${scale > 0 ? box.radius / scale : box.radius}px`,
    };
  });
}

/** A departure is for the screen that appears right after; later than this it is forgotten. */
export const DEPARTURE_TTL_MS = 1000;

export function isFresh(departedAt: number, now: number): boolean {
  return now - departedAt <= DEPARTURE_TTL_MS;
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

type Flight = { box: () => Box; cancel: () => void };

const departures = new Map<string, { box: Box; at: number }>();
const flights = new Map<string, Flight>();

/** Remembers where the element is: the clone if it is mid-flight, else the element's last box. */
function leave(key: string, lastBox: Box) {
  const flight = flights.get(key);
  const box = flight ? flight.box() : lastBox;
  flight?.cancel();
  departures.set(key, { box, at: performance.now() });
}

function arrive(key: string, node: HTMLElement) {
  const departure = departures.get(key);
  departures.delete(key);
  if (!departure || !isFresh(departure.at, performance.now())) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { duration, easing } = motionFor("large", reduced);

  // Under reduced motion nothing travels: the Sleeve appears with a brief crossfade.
  if (reduced) {
    node.animate([{ opacity: 0 }, { opacity: 1 }], { duration });
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

  const animation = ghost.animate(flightKeyframes(departure.box, to, easing), {
    duration,
    fill: "forwards",
  });
  const finish = () => {
    ghost.remove();
    node.style.visibility = "";
    flights.delete(key);
  };
  flights.set(key, {
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

/**
 * Marks an element as one end of a shared element. On mount it flies in from where the other
 * end last was (if that was just now); on destroy it records where it was for the other end.
 */
export function sharedElement(key: string): Attachment<HTMLElement> {
  return (node) => {
    // A node hidden by an earlier departure (it stayed connected) shows again.
    node.style.visibility = "";
    arrive(key, node);
    // By the time this runs on destroy the element is already out of the document and has no
    // box, so keep the last one seen: refreshed before whatever starts a navigation.
    let lastBox = boxOf(node);
    const refresh = () => {
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
      leave(key, lastBox);
    };
  };
}
