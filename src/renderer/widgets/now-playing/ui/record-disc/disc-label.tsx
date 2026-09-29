import { m } from "motion/react";
import { graphemes } from "@/renderer/shared/lib/graphemes";
import { labelInk } from "@/renderer/shared/ui/artwork-light";
import { useMotionTransition } from "@/renderer/shared/ui/motion";

/** Longest ring text that fits round the label at its size. */
const MAX_RING_CHARS = 30;
const RING_ID = "record-label-ring";

/** `The Title  Artist  FLAC 24/96  4:12`, cut to what fits round the label. */
export function ringText(parts: readonly (string | null | undefined)[]): string {
  const text = parts.filter((part): part is string => part != null && part !== "").join("  ");
  const chars = graphemes(text);
  return chars.length <= MAX_RING_CHARS ? text : `${chars.slice(0, MAX_RING_CHARS - 1).join("")}…`;
}

/**
 * The disc's label: a flat circle in the artwork's colour (never the artwork itself, which
 * already appears as the Sleeve), the track's facts written round its edge, and the track
 * number in the middle. It turns with the disc. Without a colour it is a faint ink.
 */
export function DiscLabel({
  color,
  ring,
  trackNumber,
}: {
  color: string | null;
  ring: string;
  trackNumber: number | null;
}) {
  const transition = useMotionTransition("light");
  const fill = color ?? "rgba(250, 250, 250, 0.1)";
  const ink = color === null ? "#fafafa" : labelInk(color);
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 size-full">
      <defs>
        <path id={RING_ID} d="M 50 37.2 a 12.8 12.8 0 1 1 -0.01 0" />
      </defs>
      <m.circle cx="50" cy="50" r="17" initial={false} animate={{ fill }} transition={transition} />
      <m.text
        fontSize="4.6"
        initial={false}
        animate={{ fill: ink }}
        transition={transition}
        style={{ letterSpacing: "0.02em" }}
      >
        <textPath href={`#${RING_ID}`} startOffset="0">
          {ring}
        </textPath>
      </m.text>
      {trackNumber !== null ? (
        <m.text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="11"
          initial={false}
          animate={{ fill: ink }}
          transition={transition}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {trackNumber}
        </m.text>
      ) : null}
      <circle cx="50" cy="50" r="1.25" style={{ fill: "var(--background)" }} />
    </svg>
  );
}
