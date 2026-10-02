import { settlingLength } from "./spring-curve";

/**
 * Motion tokens (DESIGN.md, principle 7, ADR 0007). Every movement follows the one spring curve
 * in `spring-curve.ts`; a token is only how long it feels (Apple's perceptual duration), and the
 * length an animation actually runs is derived from it. Never animate a blur radius: animate
 * `transform`, `opacity`, `clip-path`.
 *
 * The tokens are plain data. Turning one into a Svelte transition or a CSS value is done in
 * `svelte-motion.ts` and `css-motion.ts`.
 */
export const motionTokens = {
  /** Hover, press, colour changes. */
  feedback: { duration: 75 },
  /** Icons, digits, lyric lines, sweeps, the queue, overlays. */
  move: { duration: 220 },
  /** Dock <-> Now Playing, album tile <-> details, the Sleeve, the Light. */
  large: { duration: 310 },
} as const;

export type MotionToken = keyof typeof motionTokens;

/** Under reduced motion every movement becomes this crossfade (it runs this long, as is). */
export const crossfade = { duration: 100 } as const;

/** How long a token runs, in ms: its settling length, or the crossfade under reduced motion. */
export function tokenDuration(token: MotionToken, reducedMotion: boolean): number {
  return reducedMotion ? crossfade.duration : settlingLength(motionTokens[token].duration);
}
