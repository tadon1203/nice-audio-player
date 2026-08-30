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
    <div
      className="relative grid h-[100dvh] w-full grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-canvas"
      data-testid="app-shell"
    >
      <div
        data-slot="app-workspace"
        className={`relative grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] app-wide:grid-cols-[192px_minmax(0,1fr)] app-wide:grid-rows-1 ${contextOpen ? "context-split:grid-cols-[192px_minmax(0,1fr)_clamp(360px,28vw,400px)]" : ""}`}
        data-context-open={contextOpen ? "true" : "false"}
      >
        <nav
          className="grid grid-cols-2 content-start gap-2 border-b border-border-subtle bg-surface px-6 py-2 app-wide:grid-cols-1 app-wide:border-b-0 app-wide:border-e app-wide:px-3 app-wide:pb-6 app-wide:pt-[72px]"
          aria-label="Application"
        >
          {(["library", "settings"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-current={destination === item ? "page" : undefined}
              className={`relative min-h-12 rounded-control border-0 bg-transparent px-3 text-center text-body-lg text-text-secondary app-wide:px-6 app-wide:text-start hover:bg-surface-hover hover:text-text-primary ${destination === item ? "bg-surface-raised text-text-primary" : ""}`}
              onClick={() => onDestinationChange(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
              {destination === item ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-current app-wide:inset-x-auto app-wide:inset-y-2 app-wide:bottom-auto app-wide:start-1 app-wide:h-auto app-wide:w-[3px]"
                />
              ) : null}
            </button>
          ))}
        </nav>
        <main
          data-slot="app-main"
          className="col-start-1 row-start-2 min-h-0 min-w-0 overflow-hidden app-wide:col-start-2 app-wide:row-start-1"
          inert={contextOverlay && contextOpen ? true : undefined}
          aria-hidden={contextOverlay && contextOpen ? true : undefined}
        >
          <div className="h-full min-h-0 min-w-0">
            <div className="h-full min-h-0">{main}</div>
          </div>
        </main>
        {contextPane ? (
          <div
            data-slot="app-context-pane"
            className="z-10 col-start-1 row-start-2 h-full min-h-0 min-w-0 overflow-hidden app-wide:col-start-2 app-wide:row-start-1 context-split:col-start-3"
          >
            {contextPane}
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-block-end-3 start-6 z-[2] max-w-[min(360px,calc(100%-32px))] app-wide:start-[208px]">
          {activity}
        </div>
      </div>
      <footer
        data-slot="app-persistent"
        className="min-h-0 min-w-0 max-h-[100dvh] overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        {dock}
      </footer>
    </div>
  );
}
