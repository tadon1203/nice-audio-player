import { useEffect, useState } from "react";
import { m } from "motion/react";
import { graphemes } from "@/renderer/shared/lib/graphemes";
import { cn } from "@/renderer/shared/lib/utils";
import { useMotionTransition } from "./motion";

const STEP_S = 0.012;
const TOTAL_S = 0.24;
/** The overlay is dropped this long after its last character starts, once the spring has settled. */
const SETTLE_MS = 500;

/**
 * Text whose characters slide in one after another, from the side the track came from
 * (`direction` 1 = from the right). The stagger is 12ms a character, capped at 240ms in total.
 * Shown only for track changes, never on first display; key it by what it shows so a new value
 * plays again.
 *
 * The real text is always in the flow, so it wraps, kerns, and can be selected like any other
 * text; it is only transparent while the animated copy (an `aria-hidden` overlay of inline
 * spans, which wrap the same way) plays. The overlay is removed afterwards.
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
  const transition = useMotionTransition("smallMove");
  const [playing, setPlaying] = useState(true);
  const chars = graphemes(text);
  const step = Math.min(STEP_S, TOTAL_S / Math.max(1, chars.length));

  useEffect(() => {
    const timer = setTimeout(() => setPlaying(false), TOTAL_S * 1000 + SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span className={cn("relative", className)}>
      <span className={playing ? "text-transparent selection:text-transparent" : undefined}>
        {text}
      </span>
      {playing ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
          {chars.map((char, index) => (
            <m.span
              key={index}
              className="relative"
              initial={{ opacity: 0, left: 8 * direction }}
              animate={{ opacity: 1, left: 0 }}
              transition={{ ...transition, delay: index * step }}
            >
              {char}
            </m.span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
