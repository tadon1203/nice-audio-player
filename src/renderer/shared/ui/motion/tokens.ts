import type { Transition } from "motion/react";

/**
 * Motion tokens (see DESIGN.md, "Motion"). Everything that moves uses a fully damped
 * spring (`bounce: 0`); only hover/press feedback and the Light crossfade use a fixed
 * duration. Never animate a blur radius: animate `transform`, `opacity`, `clip-path`.
 */
export const motionTokens = {
  /** Hover, press, color changes. */
  feedback: { duration: 0.1, ease: "easeOut" },
  /** Tabs, Select, tooltips, lyric line luminance. */
  smallMove: { type: "spring", visualDuration: 0.2, bounce: 0 },
  /** Queue panel, Sheet, lyrics scroll, track changes. */
  mediumMove: { type: "spring", visualDuration: 0.3, bounce: 0 },
  /** Dock <-> Now Playing, album tile <-> details. */
  largeMove: { type: "spring", visualDuration: 0.42, bounce: 0 },
  /** Light is illumination, not an object, so it fades instead of moving. */
  light: { duration: 0.4, ease: "easeInOut" },
} as const satisfies Record<string, Transition>;

export type MotionToken = keyof typeof motionTokens;

/** Under reduced motion every movement becomes a 100ms crossfade. */
export const reducedMotionTransition = motionTokens.feedback satisfies Transition;

export function resolveTransition(token: MotionToken, reducedMotion: boolean): Transition {
  return reducedMotion ? reducedMotionTransition : motionTokens[token];
}
