import type { ReactNode, Ref } from "react";
import { ContentTransition } from "./ui/ContentTransition";

interface AppShellProps {
  main: ReactNode;
  dock: ReactNode;
  activity?: ReactNode;
  destination?: "library" | "settings";
  onDestinationChange?: (destination: "library" | "settings") => void;
  mainScrollRef?: Ref<HTMLElement>;
  contextPane?: ReactNode;
  contextPaneState?: "closed" | "opening" | "open" | "closing";
}

export function AppShell({
  main,
  dock,
  activity,
  destination = "library",
  onDestinationChange = () => undefined,
  mainScrollRef,
  contextPane,
  contextPaneState = "open",
}: AppShellProps) {
  return (
    <div className="app-shell" data-testid="app-shell">
      <div className="app-shell__workspace">
        <nav className="app-shell__navigation" aria-label="Application">
          <button
            type="button"
            aria-current={destination === "library" ? "page" : undefined}
            className={
              destination === "library" ? "app-shell__nav-item is-active" : "app-shell__nav-item"
            }
            onClick={() => onDestinationChange("library")}
          >
            Library
          </button>
          <button
            type="button"
            aria-current={destination === "settings" ? "page" : undefined}
            className={
              destination === "settings" ? "app-shell__nav-item is-active" : "app-shell__nav-item"
            }
            onClick={() => onDestinationChange("settings")}
          >
            Settings
          </button>
        </nav>
        <main ref={mainScrollRef} className="app-shell__main">
          <ContentTransition contentKey={destination} direction="neutral">
            {main}
          </ContentTransition>
        </main>
        {contextPane ? (
          <div
            className="app-shell__context-pane"
            data-state={contextPaneState}
            aria-hidden={
              contextPaneState === "closed" ||
              contextPaneState === "opening" ||
              contextPaneState === "closing" ||
              undefined
            }
            inert={
              contextPaneState === "closed" ||
              contextPaneState === "opening" ||
              contextPaneState === "closing" ||
              undefined
            }
          >
            <div className="app-shell__context-content" data-state={contextPaneState}>
              {contextPane}
            </div>
          </div>
        ) : null}
        <div className="app-shell__activity">{activity}</div>
      </div>
      <footer className="app-shell__persistent">{dock}</footer>
    </div>
  );
}
