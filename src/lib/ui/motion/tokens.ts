/**
 * Motion tokens (DESIGN.md, principle 7, ADR 0005). Everything that moves or changes state is a
 * fully damped spring (`bounce: 0`, except `press`). The exceptions are `press` (may overshoot),
 * the reduced-motion `crossfade` (a fixed tween) and progress motion (constant speed, not a token).
 * Never animate a blur radius: animate `transform`, `opacity`, `clip-path`.
 *
 * The tokens are plain data. Converting one into a Svelte transition, a CSS value or an imperative
 * animation is done where it is used, so nothing here depends on an animation library.
 */
export type SpringToken = {
  readonly kind: "spring";
  /** Seconds until the spring visually settles. */
  readonly visualDuration: number;
  readonly bounce: number;
};

export type TweenToken = {
  readonly kind: "tween";
  /** Seconds. */
  readonly duration: number;
  readonly ease: "easeOut" | "easeInOut";
};

export type MotionTransition = SpringToken | TweenToken;

/** Under reduced motion every movement becomes this fixed 100ms crossfade. */
export const crossfade: TweenToken = { kind: "tween", duration: 0.1, ease: "easeOut" };

export const motionTokens = {
  /** Hover, press and color changes. */
  feedback: { kind: "spring", visualDuration: 0.1, bounce: 0 },
  /** Tabs, Select, tooltips, lyric line luminance. */
  smallMove: { kind: "spring", visualDuration: 0.2, bounce: 0 },
  /** Queue panel, Sheet, lyrics scroll, track changes. */
  mediumMove: { kind: "spring", visualDuration: 0.3, bounce: 0 },
  /** Dock <-> Now Playing, album tile <-> details. */
  largeMove: { kind: "spring", visualDuration: 0.42, bounce: 0 },
  /** Rolling digits (`RollingNumber`). */
  roll: { kind: "spring", visualDuration: 0.35, bounce: 0 },
  /** Digits that turn several times: a seek, a count changing a lot. */
  spin: { kind: "spring", visualDuration: 0.6, bounce: 0 },
  /** The play button's press. The only spring allowed to overshoot. */
  press: { kind: "spring", visualDuration: 0.15, bounce: 0.25 },
  /** Light is illumination, not an object, so it fades instead of moving. */
  light: { kind: "spring", visualDuration: 0.4, bounce: 0 },
} as const satisfies Record<string, SpringToken>;

export type MotionToken = keyof typeof motionTokens;

export function resolveTransition(token: MotionToken, reducedMotion: boolean): MotionTransition {
  return reducedMotion ? crossfade : motionTokens[token];
}
