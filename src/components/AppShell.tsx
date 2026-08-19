import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useIsPresent, useReducedMotion } from "motion/react";
import { effectsMotion, spatialIndicator, spatialStructural } from "@/lib/motion";
import { ExclusiveRegion } from "./ui/ExclusiveRegion";

interface AppShellProps {
  main: ReactNode;
  dock: ReactNode;
  activity?: ReactNode;
  destination?: "library" | "settings";
  onDestinationChange?: (destination: "library" | "settings") => void;
  contextPane?: ReactNode;
}

const splitContextQuery = "(min-width: 1440px)";

function useContextLayout() {
  const [state, setState] = useState(() => ({
    layout:
      typeof window !== "undefined" && window.matchMedia(splitContextQuery).matches
        ? ("split" as const)
        : ("stacked" as const),
    correcting: false,
  }));

  useEffect(() => {
    if (!state.correcting) return;
    const frame = window.requestAnimationFrame(() =>
      setState((current) => ({ ...current, correcting: false })),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [state.correcting]);

  useEffect(() => {
    const media = window.matchMedia(splitContextQuery);
    const update = () => {
      const layout = media.matches ? "split" : "stacked";
      setState((current) => (current.layout === layout ? current : { layout, correcting: true }));
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return state;
}

function ContextPaneContents({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div
      className="app-shell__context-content"
      data-state={present ? "open" : "closing"}
      aria-hidden={!present || undefined}
      inert={!present || undefined}
    >
      {children}
    </div>
  );
}
export function AppShell({
  main,
  dock,
  activity,
  destination = "library",
  onDestinationChange = () => undefined,
  contextPane,
}: AppShellProps) {
  const reduced = useReducedMotion();
  const { layout: contextLayout, correcting: layoutCorrecting } = useContextLayout();
  const stacked = contextLayout === "stacked";
  const contextOpen = Boolean(contextPane);
  const structuralLayout = !reduced && !layoutCorrecting && !stacked;
  const transition = layoutCorrecting
    ? { duration: 0 }
    : {
        opacity: { duration: effectsMotion.content, ease: effectsMotion.ease },
        x: spatialStructural,
      };
  const exitTransition = layoutCorrecting
    ? { duration: 0 }
    : {
        opacity: { duration: effectsMotion.feedback, ease: effectsMotion.ease },
        x: spatialStructural,
      };
  return (
    <div className="app-shell" data-testid="app-shell">
      <LayoutGroup>
        <div
          className="app-shell__workspace"
          data-context-open={contextOpen ? "true" : "false"}
          data-context-layout={contextLayout}
          data-layout-correcting={layoutCorrecting ? "true" : "false"}
        >
          <nav className="app-shell__navigation" aria-label="Application">
            {(["library", "settings"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-current={destination === item ? "page" : undefined}
                className={
                  destination === item ? "app-shell__nav-item is-active" : "app-shell__nav-item"
                }
                onClick={() => onDestinationChange(item)}
              >
                {destination === item ? (
                  <motion.span
                    layoutId="app-shell-active-marker"
                    className="app-shell__nav-marker"
                    transition={spatialIndicator}
                    aria-hidden="true"
                  />
                ) : null}
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </nav>
          <motion.main
            className="app-shell__main"
            inert={stacked && contextOpen ? true : undefined}
            aria-hidden={stacked && contextOpen ? true : undefined}
            layout={structuralLayout}
            transition={layoutCorrecting ? { duration: 0 } : spatialStructural}
          >
            <motion.div
              layout={structuralLayout ? "position" : false}
              className="app-shell__main-content"
            >
              <motion.div
                className="app-shell__main-surface"
                initial={false}
                animate={
                  stacked && contextOpen
                    ? reduced
                      ? { opacity: 0 }
                      : { opacity: 0, x: -24 }
                    : { opacity: 1, x: 0 }
                }
                transition={transition}
              >
                <ExclusiveRegion activeKey={destination}>{main}</ExclusiveRegion>
              </motion.div>
            </motion.div>
          </motion.main>
          <AnimatePresence initial={false} mode="popLayout">
            {contextPane ? (
              <motion.div
                key="context-pane"
                className="app-shell__context-pane"
                initial={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
                animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
                exit={
                  reduced
                    ? { opacity: 0, transition: exitTransition }
                    : { opacity: 0, x: 24, transition: exitTransition }
                }
                transition={transition}
              >
                <ContextPaneContents>{contextPane}</ContextPaneContents>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="app-shell__activity">{activity}</div>
        </div>
      </LayoutGroup>
      <footer className="app-shell__persistent">{dock}</footer>
    </div>
  );
}
