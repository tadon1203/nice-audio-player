import { m } from "motion/react";
import type { ArtworkRef } from "@/shared/ipc";
import { useMotionTransition } from "../motion";
import { ArtworkLight } from "./artwork-light";

export type RovingTarget = {
  artwork: ArtworkRef | null;
  /** Centre of the hovered tile, relative to the light's container. */
  x: number;
  y: number;
  /** False once the pointer has left the grid: the light fades away. */
  active: boolean;
};

const SIZE_PX = 448;

/**
 * A single faint Light behind a grid that follows the hovered or focused tile (spring, not a
 * jump) and takes that tile's artwork (crossfading, like any Light). It fades away 400ms after
 * the pointer leaves. Place it first inside a `relative` container, under the grid.
 */
export function RovingLight({ target }: { target: RovingTarget | null }) {
  const move = useMotionTransition("mediumMove");
  const fade = useMotionTransition("light");
  if (target === null) return null;
  const x = target.x - SIZE_PX / 2;
  const y = target.y - SIZE_PX / 2;
  return (
    <m.div
      aria-hidden="true"
      data-slot="roving-light"
      className="pointer-events-none absolute top-0 left-0 mask-[radial-gradient(closest-side,black,transparent)]"
      style={{ width: SIZE_PX, height: SIZE_PX }}
      initial={{ x, y, opacity: 0 }}
      animate={{ x, y, opacity: target.active ? 1 : 0 }}
      transition={{ x: move, y: move, opacity: fade }}
    >
      <ArtworkLight artwork={target.artwork} strength="faint" />
    </m.div>
  );
}
