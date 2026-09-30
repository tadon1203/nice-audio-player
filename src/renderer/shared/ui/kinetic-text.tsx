import { animate, m, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import { cn } from "@/renderer/shared/lib/utils";
import { useMotionTransition } from "./motion";

/** How far the soft edge of the wipe reaches behind its front, in percent of the text width. */
const EDGE_PERCENT = 20;
/** The wipe front travels this far so the soft edge clears the end of the text. */
const REVEAL_END_PERCENT = 100 + EDGE_PERCENT;

/**
 * Text that wipes in from left to right while it slides 8px from the side the track came from
 * (`direction` 1 = from the right). Shown only for track changes, never on first display; key it
 * by what it shows so a new value plays again.
 *
 * Only the real text is drawn, so wrapping, kerning and line breaks are the same from the first
 * frame to the last: the animation is a mask and a transform, and never changes the layout.
 * Under reduced motion it is a plain crossfade.
 */
export function KineticText({
  text,
  direction,
  className,
}: {
  text: string;
  direction: 1 | -1;
  className?: string;
}) {
  const transition = useMotionTransition("mediumMove");
  const reducedMotion = useReducedMotion() === true;
  const reveal = useMotionValue(0);
  const maskImage = useTransform(
    reveal,
    (value) =>
      `linear-gradient(to right, black calc(${value}% - ${EDGE_PERCENT}%), transparent ${value}%)`,
  );

  useEffect(() => {
    if (reducedMotion) return;
    const controls = animate(reveal, REVEAL_END_PERCENT, transition);
    return () => controls.stop();
    // The transition object is stable per token; the wipe plays once per mount.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <m.span
      className={cn("block", className)}
      initial={reducedMotion ? { opacity: 0 } : { x: 8 * direction }}
      animate={reducedMotion ? { opacity: 1 } : { x: 0 }}
      transition={transition}
      // The wipe ends past the text, so once it is done the mask clips nothing.
      style={reducedMotion ? undefined : { maskImage, WebkitMaskImage: maskImage }}
    >
      {text}
    </m.span>
  );
}
