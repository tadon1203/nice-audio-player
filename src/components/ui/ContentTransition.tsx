import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { interfaceEase, motionDurationSeconds, reducedMotionDurationSeconds } from "@/lib/motion";

interface ContentTransitionProps {
  contentKey: string;
  children: ReactNode;
}

/** Keeps persistent shell regions stable while a destination changes. */
export function ContentTransition({ contentKey, children }: ContentTransitionProps) {
  const reducedMotion = useReducedMotion();
  const transition = {
    duration: reducedMotion ? reducedMotionDurationSeconds : motionDurationSeconds.content,
    ease: interfaceEase,
  };
  return (
    <div className="content-transition-stage">
      <AnimatePresence initial={false} mode="sync">
        <motion.div
          key={contentKey}
          className="content-transition"
          data-motion={reducedMotion ? "reduced" : "content"}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={transition}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
