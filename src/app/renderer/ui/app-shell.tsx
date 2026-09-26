import { Outlet, useRouterState } from "@tanstack/react-router";
import { PlaybackRegion } from "@/renderer/widgets/playback-region";
import { Navigation } from "./navigation";
import { TitleBar } from "./title-bar";

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[40px_minmax(0,1fr)_88px] bg-background md:grid-cols-[16rem_minmax(0,1fr)]">
      <TitleBar pathname={pathname} />

      <aside className="hidden min-h-0 w-64 bg-sidebar text-sidebar-foreground md:flex">
        <Navigation pathname={pathname} />
      </aside>

      <main className="min-h-0 min-w-0 overflow-hidden" data-slot="app-main">
        <Outlet />
      </main>

      <div className="col-span-full h-full min-h-0 min-w-0">
        <PlaybackRegion />
      </div>
    </div>
  );
}
