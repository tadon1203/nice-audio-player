import { motion, useReducedMotion } from "motion/react";
import { spatialIndicator } from "@/lib/motion";

export function LibraryPresentationTabs({
  presentation,
  onChange,
}: {
  presentation: "albums" | "albumArtists" | "tracks";
  onChange: (presentation: "albums" | "albumArtists" | "tracks") => void;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <div className="library-view__switch" role="group" aria-label="Library presentation">
      {(["albums", "albumArtists", "tracks"] as const).map((value) => {
        const active = presentation === value;
        return (
          <button
            key={value}
            type="button"
            className={active ? "is-active" : ""}
            aria-pressed={active}
            onClick={() => onChange(value)}
          >
            {value === "albumArtists" ? "Album Artists" : value[0].toUpperCase() + value.slice(1)}
            {active ? (
              reducedMotion ? (
                <span className="library-view__tab-indicator" aria-hidden="true" />
              ) : (
                <motion.span
                  className="library-view__tab-indicator"
                  layoutId="library-presentation-indicator"
                  transition={spatialIndicator}
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
