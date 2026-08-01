import type { ReactNode } from "react";

interface AppShellProps {
  main: ReactNode;
  dock: ReactNode;
}

export function AppShell({ main, dock }: AppShellProps) {
  return (
    <div className="app-shell" data-testid="app-shell">
      <main className="app-shell__main">{main}</main>
      <footer className="app-shell__persistent">{dock}</footer>
      <div id="overlay-root" />
    </div>
  );
}
