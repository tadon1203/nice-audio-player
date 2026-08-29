import type { ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { contentNavigationDisplacement, effectsMotion } from "@/lib/motion";

function PresenceContents({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div
      className="exclusive-region__contents"
      data-state={present ? "present" : "exiting"}
      inert={!present || undefined}
      aria-hidden={!present || undefined}
    >
      {children}
    </div>
  );
}

/** Neutral replacement for complete, mutually exclusive semantic subtrees. */
export function ExclusiveRegion({
  activeKey,
  children,
  className,
  direction = 0,
}: {
  activeKey: string;
  children: ReactNode;
  className?: string;
  direction?: number;
}) {
  const reduced = useReducedMotion();
  const variants = reduced
    ? {
        initial: () => ({ opacity: 0 }),
        animate: () => ({
          opacity: 1,
          transition: { duration: effectsMotion.reduced, ease: effectsMotion.ease },
        }),
        exit: () => ({
          opacity: 0,
          transition: { duration: effectsMotion.reduced, ease: effectsMotion.ease },
        }),
      }
    : {
        initial: (value: number) =>
          value === 0
            ? { opacity: 0 }
            : { opacity: 0, x: Math.sign(value) * contentNavigationDisplacement },
        animate: (value: number) =>
          value === 0
            ? {
                opacity: 1,
                transition: { duration: effectsMotion.content, ease: effectsMotion.ease },
              }
            : {
                opacity: 1,
                x: 0,
                transition: { duration: effectsMotion.content, ease: effectsMotion.ease },
              },
        exit: (value: number) =>
          value === 0
            ? {
                opacity: 0,
                transition: { duration: effectsMotion.content, ease: effectsMotion.ease },
              }
            : {
                opacity: 0,
                x: -Math.sign(value) * contentNavigationDisplacement,
                transition: { duration: effectsMotion.content, ease: effectsMotion.ease },
              },
      };
  return (
    <div className={`exclusive-region${className ? ` ${className}` : ""}`}>
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.div
          key={activeKey}
          className="exclusive-region__item"
          custom={direction}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <PresenceContents>{children}</PresenceContents>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
