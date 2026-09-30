import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { motionTokens } from "../motion/tokens";
import { useMotionTransition } from "../motion/use-motion-transition";

/**
 * Text that flips over like a split-flap card when its value changes; an unchanged value does
 * not move, so a steady signal path stays still. Under reduced motion it crossfades.
 */
export function FlapText({ value, className }: { value: string; className?: string }) {
  const reduced = useReducedMotion() === true;
  const transition = useMotionTransition("smallMove");
  return (
    <span className={className} style={{ perspective: 400 }}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" className="inline-flex">
        <AnimatePresence initial={false} mode="popLayout">
          <m.span
            key={value}
            data-glyph={value}
            className="inline-block whitespace-pre before:content-[attr(data-glyph)]"
            initial={reduced ? { opacity: 0 } : { rotateX: -90, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { rotateX: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { rotateX: 90, opacity: 0 }}
            transition={reduced ? motionTokens.feedback : transition}
            style={{ transformOrigin: "50% 50%" }}
          ></m.span>
        </AnimatePresence>
      </span>
    </span>
  );
}
