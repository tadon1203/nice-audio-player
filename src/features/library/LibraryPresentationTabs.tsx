import { motion, useReducedMotion } from "motion/react";
import { interfaceEase, motionDurationSeconds } from "@/lib/motion";

export function LibraryPresentationTabs({
  presentation,
  onChange,
}: {
  presentation: "albums" | "tracks";
  onChange: (presentation: "albums" | "tracks") => void;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <div className="library-view__switch" role="group" aria-label="Library presentation">
      {(["albums", "tracks"] as const).map((value) => {
        const active = presentation === value;
        return (
          <button
            key={value}
            type="button"
            className={active ? "is-active" : ""}
            aria-pressed={active}
            onClick={() => onChange(value)}
          >
            {value[0].toUpperCase() + value.slice(1)}
            {active ? (
              reducedMotion ? (
                <span className="library-view__tab-indicator" aria-hidden="true" />
              ) : (
                <motion.span
                  className="library-view__tab-indicator"
                  layoutId="library-presentation-indicator"
                  transition={{ duration: motionDurationSeconds.state, ease: interfaceEase }}
                  aria-hidden="true"
                />
              )
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
