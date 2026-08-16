import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { interfaceEase, motionDurationSeconds, reducedMotionDurationSeconds } from "@/lib/motion";
import {
  contentTransitionVariants,
  reducedContentTransitionVariants,
} from "./ContentTransitionVariants";

interface ContentTransitionProps {
  contentKey: string;
  children: ReactNode;
  direction?: ContentTransitionDirection;
}

export type ContentTransitionDirection = "neutral" | "forward" | "backward";

/** Keeps persistent shell regions stable while a destination changes. */
export function ContentTransition({
  contentKey,
  children,
  direction = "neutral",
}: ContentTransitionProps) {
  const reducedMotion = useReducedMotion();
  const transition = {
    duration: reducedMotion ? reducedMotionDurationSeconds : motionDurationSeconds.content,
    ease: interfaceEase,
  };
  return (
    <div className="content-transition-stage">
      <AnimatePresence initial={false} mode="sync" custom={direction}>
        <motion.div
          key={contentKey}
          className="content-transition"
          data-motion={reducedMotion ? "reduced" : "content"}
          data-motion-direction={direction}
          variants={reducedMotion ? reducedContentTransitionVariants : contentTransitionVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          custom={direction}
          transition={transition}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
