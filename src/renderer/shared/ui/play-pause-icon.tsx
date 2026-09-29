import { m } from "motion/react";
import { useMotionTransition } from "./motion";

// Both glyphs are two four-point shapes with the same vertex order (top-left, top-right,
// bottom-right, bottom-left) so one becomes the other by interpolating the path.
// Play is lucide's triangle cut at x = 13; pause is two bars.
const PLAY = ["M6 3L13 7.5L13 16.5L6 21Z", "M13 7.5L20 12L20 12L13 16.5Z"] as const;
const PAUSE = ["M6 4L9 4L9 20L6 20Z", "M15 4L18 4L18 20L15 20Z"] as const;

/**
 * The one play/pause glyph: the dock, track rows, and detail headers all use it, so the play
 * affordance looks the same everywhere. `playing` shows the pause bars; a change morphs.
 */
export function PlayPauseIcon({
  playing,
  ...props
}: { playing: boolean } & Omit<React.SVGProps<SVGSVGElement>, "ref">) {
  const transition = useMotionTransition("smallMove");
  const shapes = playing ? PAUSE : PLAY;
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      {...props}
    >
      {shapes.map((d, i) => (
        <m.path key={i} initial={false} animate={{ d }} transition={transition} />
      ))}
    </svg>
  );
}
