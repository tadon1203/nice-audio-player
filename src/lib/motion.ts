/** Duration/easing motion acknowledges state and feedback; it is never spatial motion. */
export const effectsMotion = {
  feedback: 0.16,
  state: 0.22,
  content: 0.32,
  image: 0.6,
  reduced: 0.12,
  ease: [0.22, 1, 0.36, 1] as const,
} as const;

/** Non-oscillating shared profiles for structural continuity and short indicators. */
export const spatialStructural = {
  type: "spring",
  stiffness: 400,
  damping: 40,
  mass: 1,
  restDelta: 0.5,
  restSpeed: 10,
} as const;
export const spatialIndicator = {
  type: "spring",
  stiffness: 900,
  damping: 60,
  mass: 1,
  restDelta: 0.5,
  restSpeed: 10,
} as const;
