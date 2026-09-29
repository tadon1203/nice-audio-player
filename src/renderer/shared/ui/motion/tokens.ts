import type { Transition } from "motion/react";

/**
 * Motion tokens (see DESIGN.md, "Motion"). Everything that moves uses a fully damped
 * spring (`bounce: 0`, except `press`); only hover/press feedback and the Light crossfade use a fixed
 * duration. Never animate a blur radius: animate `transform`, `opacity`, `clip-path`.
 */
export const motionTokens = {
  /** Hover, press, color changes. Must equal `--duration-feedback` in styles.css. */
  feedback: { duration: 0.1, ease: "easeOut" },
  /** Tabs, Select, tooltips, lyric line luminance. */
  smallMove: { type: "spring", visualDuration: 0.2, bounce: 0 },
  /** Queue panel, Sheet, lyrics scroll, track changes. */
  mediumMove: { type: "spring", visualDuration: 0.3, bounce: 0 },
  /** Dock <-> Now Playing, album tile <-> details. */
  largeMove: { type: "spring", visualDuration: 0.42, bounce: 0 },
  /** Rolling digits (`RollingNumber`). */
  roll: { type: "spring", visualDuration: 0.35, bounce: 0 },
  /** Digits or a disc that turn several times: a seek, a count changing a lot. */
  spin: { type: "spring", visualDuration: 0.6, bounce: 0 },
  /** The play button's press. The only spring allowed to overshoot. */
  press: { type: "spring", visualDuration: 0.15, bounce: 0.25 },
  /** Light is illumination, not an object, so it fades instead of moving. */
  light: { duration: 0.4, ease: "easeInOut" },
} as const satisfies Record<string, Transition>;

export type MotionToken = keyof typeof motionTokens;

/** Under reduced motion every movement becomes a 100ms crossfade. */
export const reducedMotionTransition = motionTokens.feedback satisfies Transition;

export function resolveTransition(token: MotionToken, reducedMotion: boolean): Transition {
  return reducedMotion ? reducedMotionTransition : motionTokens[token];
}
