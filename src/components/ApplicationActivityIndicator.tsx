import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import type { ApplicationActivity } from "@/bindings";
import { effectsMotion } from "@/lib/motion";

export function ApplicationActivityIndicator({
  activity,
  onOpenSettings = () => undefined,
}: {
  activity: ApplicationActivity | null;
  onOpenSettings?: () => void;
}) {
  const [visible, setVisible] = useState<ApplicationActivity | null>(null);
  const shownAt = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const now = Date.now();
    if (activity?.state === "attentionRequired") {
      shownAt.current = now;
      const timer = window.setTimeout(() => setVisible(activity), 0);
      return () => window.clearTimeout(timer);
    }
    if (activity?.state === "running") {
      if (visible?.state === "running") return;
      const timer = window.setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(activity);
      }, 400);
      return () => window.clearTimeout(timer);
    }
    if (!visible) return;
    const remaining = Math.max(0, 600 - (now - (shownAt.current ?? now)));
    const timer = window.setTimeout(() => {
      shownAt.current = null;
      setVisible(null);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [activity, visible]);
  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          key="application-activity"
          className={`application-activity application-activity--${visible.state}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reducedMotion ? effectsMotion.reduced : effectsMotion.feedback,
            ease: effectsMotion.ease,
          }}
        >
          <ActivityContents>
            <span>
              {visible.state === "running" ? "Updating library…" : "Library update needs attention"}
            </span>
            {visible.state === "attentionRequired" ? (
              <button type="button" onClick={onOpenSettings}>
                Open settings
              </button>
            ) : null}
          </ActivityContents>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ActivityContents({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div
      className="application-activity__contents"
      role={present ? "status" : undefined}
      aria-live={present ? "polite" : undefined}
      aria-atomic={present ? "true" : undefined}
      aria-hidden={!present || undefined}
      inert={!present || undefined}
    >
      {children}
    </div>
  );
}
