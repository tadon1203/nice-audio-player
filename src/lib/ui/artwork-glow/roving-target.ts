import type { ArtworkRef } from "#lib/native";

/** Where the Artwork glow is and what it shows. */
export interface RovingTarget {
  artwork: ArtworkRef | null;
  /** Centre of the hovered tile, relative to the light's container. */
  x: number;
  y: number;
  /** False once the pointer has left the grid: the light fades away. */
  active: boolean;
}
