import { type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion, useIsPresent, useReducedMotion } from "motion/react";
import { effectsMotion, spatialIndicator, spatialStructural } from "@/lib/motion";
import { useContextOverlaySemantics } from "@/hooks/use-context-overlay-semantics";
import { ExclusiveRegion } from "./ui/ExclusiveRegion";

interface AppShellProps {
  main: ReactNode;
  dock: ReactNode;
  activity?: ReactNode;
  destination?: "library" | "settings";
  onDestinationChange?: (destination: "library" | "settings") => void;
  contextPane?: ReactNode;
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
  const contextOverlay = useContextOverlaySemantics();
  const contextOpen = Boolean(contextPane);
  const transition = {
    opacity: { duration: effectsMotion.content, ease: effectsMotion.ease },
    x: spatialStructural,
  };
  const exitTransition = {
    opacity: { duration: effectsMotion.feedback, ease: effectsMotion.ease },
    x: spatialStructural,
  };
  return (
    <div className="app-shell" data-testid="app-shell">
      <div className="app-shell__workspace" data-context-open={contextOpen ? "true" : "false"}>
        <LayoutGroup>
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
        </LayoutGroup>
        <main
          className="app-shell__main"
          inert={contextOverlay && contextOpen ? true : undefined}
          aria-hidden={contextOverlay && contextOpen ? true : undefined}
        >
          <div className="app-shell__main-content">
            <div className="app-shell__main-surface">
              <ExclusiveRegion activeKey={destination}>{main}</ExclusiveRegion>
            </div>
          </div>
        </main>
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
      <footer className="app-shell__persistent">{dock}</footer>
    </div>
  );
}
