import { type ReactNode } from "react";
import { useContextOverlaySemantics } from "@/hooks/use-context-overlay-semantics";

interface AppShellProps {
  main: ReactNode;
  dock: ReactNode;
  activity?: ReactNode;
  destination?: "library" | "settings";
  onDestinationChange?: (destination: "library" | "settings") => void;
  contextPane?: ReactNode;
}

export function AppShell({
  main,
  dock,
  activity,
  destination = "library",
  onDestinationChange = () => undefined,
  contextPane,
}: AppShellProps) {
  const contextOverlay = useContextOverlaySemantics();
  const contextOpen = Boolean(contextPane);
  return (
    <div className="app-shell" data-testid="app-shell">
      <div className="app-shell__workspace" data-context-open={contextOpen ? "true" : "false"}>
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
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </nav>
        <main
          className="app-shell__main"
          inert={contextOverlay && contextOpen ? true : undefined}
          aria-hidden={contextOverlay && contextOpen ? true : undefined}
        >
          <div className="app-shell__main-content">
            <div className="app-shell__main-surface">{main}</div>
          </div>
        </main>
        {contextPane ? <div className="app-shell__context-pane">{contextPane}</div> : null}
        <div className="app-shell__activity">{activity}</div>
      </div>
      <footer className="app-shell__persistent">{dock}</footer>
    </div>
  );
}
