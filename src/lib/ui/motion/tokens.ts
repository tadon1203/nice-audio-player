/**
 * Motion tokens (DESIGN.md, principle 7, ADR 0006). Three durations share one ease-out curve;
 * `settle` is the one spring, for values that are retargeted while moving. Never animate a blur
 * radius: animate `transform`, `opacity`, `clip-path`.
 *
 * The tokens are plain data. Turning one into a Svelte transition or a CSS value is done in
 * `svelte-motion.ts` and `css-motion.ts`.
 */
export const motionTokens = {
  /** Hover, press, colour changes. */
  feedback: { duration: 100 },
  /** Icons, digits, lyric lines, the queue, overlays. */
  move: { duration: 300 },
  /** Dock <-> Now Playing, album tile <-> details, the Sleeve, the Light. */
  large: { duration: 420 },
} as const;

export type MotionToken = keyof typeof motionTokens;

/** Under reduced motion every movement becomes this crossfade. */
export const crossfade = { duration: 100 } as const;

/**
 * A fully damped `Spring` (`svelte/motion`; no overshoot): Apple's `.smooth` at a 0.4s
 * perceptual duration, converted to Svelte's per-frame units (stiffness = (2π/0.4 / 60)²,
 * damping = 2·√stiffness). For the Now Playing timeline and lyrics scroll.
 */
export const settle = { stiffness: 0.0685, damping: 0.5236 } as const;

/** The curve every duration uses, as CSS (cubic ease-out; Svelte's `cubicOut` is the same curve). */
export const EASE_OUT_CSS = "cubic-bezier(0.33, 1, 0.68, 1)";

export function resolveDuration(token: MotionToken, reducedMotion: boolean): number {
  return reducedMotion ? crossfade.duration : motionTokens[token].duration;
}
