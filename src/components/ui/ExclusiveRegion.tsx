import type { ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { effectsMotion } from "@/lib/motion";

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
}: {
  activeKey: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const entry = reduced ? effectsMotion.reduced : effectsMotion.content;
  const exit = reduced ? effectsMotion.reduced : effectsMotion.feedback;
  return (
    <div className="exclusive-region">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={activeKey}
          className="exclusive-region__item"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: entry, ease: effectsMotion.ease } }}
          exit={{ opacity: 0, transition: { duration: exit, ease: effectsMotion.ease } }}
        >
          <PresenceContents>{children}</PresenceContents>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
