/** Opacity by rows away from the current one (capped at 4), for lyrics and the queue alike. */
export const DISTANCE_OPACITY = [1, 0.9, 0.7, 0.5, 0.35] as const;

export function opacityAtDistance(distance: number): number {
  return DISTANCE_OPACITY[Math.min(Math.max(0, distance), DISTANCE_OPACITY.length - 1)]!;
}
