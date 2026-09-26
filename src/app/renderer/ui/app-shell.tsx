import { useEffect, useState } from "react";
import {
  Album,
  Copy,
  LibraryBig,
  ListMusic,
  Menu,
  Minimize,
  Settings2,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PlaybackRegion } from "@/renderer/widgets/playback-region";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/renderer/shared/ui/shadcn/sheet";
import { cn } from "@/renderer/shared/lib/utils";

type NavigationItem = {
  label: string;
  to: "/library/albums" | "/library/album-artists" | "/library/tracks" | "/settings";
  icon: LucideIcon;
};

const libraryItems: readonly NavigationItem[] = [
  { label: "Albums", to: "/library/albums", icon: LibraryBig },
  { label: "Album Artists", to: "/library/album-artists", icon: Album },
  { label: "Tracks", to: "/library/tracks", icon: ListMusic },
];

const settingsItem: NavigationItem = {
  label: "Settings",
  to: "/settings",
  icon: Settings2,
};

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[40px_minmax(0,1fr)_88px] bg-background md:grid-cols-[16rem_minmax(0,1fr)]">
      <header
        className="col-span-full grid min-w-0 grid-cols-[minmax(0,1fr)_auto] border-b border-border bg-background md:grid-cols-[16rem_minmax(0,1fr)_auto]"
        data-slot="app-titlebar"
      >
        <div className="flex min-w-0 items-center gap-2 border-sidebar-border px-2 md:border-r md:px-4">
          <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
            <SheetTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-9 md:hidden"
                  aria-label="Open navigation"
                />
              }
            >
              <Menu aria-hidden="true" className="size-4" />
            </SheetTrigger>
            <SheetContent
              side="left"
              showCloseButton={false}
              className="w-64 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
            >
              <div className="flex h-10 items-center justify-between border-b border-sidebar-border px-3">
                <SheetTitle className="text-sm font-medium">Nice Audio Player</SheetTitle>
                <SheetClose
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-9"
                      aria-label="Close navigation"
                    />
                  }
                >
                  <X aria-hidden="true" className="size-4" />
                </SheetClose>
              </div>
              <Navigation pathname={pathname} onNavigate={() => setMobileNavigationOpen(false)} />
            </SheetContent>
          </Sheet>
          <span
            className="truncate px-1 text-sm font-medium text-foreground md:px-0"
            data-tauri-drag-region
          >
            Nice Audio Player
          </span>
          <div aria-hidden="true" className="min-w-0 flex-1" data-tauri-drag-region />
        </div>
        <div aria-hidden="true" className="hidden min-w-0 md:block" data-tauri-drag-region />
        <WindowControls />
      </header>

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

function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void appWindow.isMaximized().then((value) => {
      if (!disposed) setMaximized(value);
    });
    void appWindow
      .onResized(() => {
        void appWindow.isMaximized().then((value) => {
          if (!disposed) setMaximized(value);
        });
      })
      .then((stopListening) => {
        if (disposed) stopListening();
        else unlisten = stopListening;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  if (!isTauri()) return null;

  const appWindow = getCurrentWindow();

  return (
    <div className="flex h-10 shrink-0 items-stretch" aria-label="Window controls" role="group">
      <Button
        type="button"
        variant="ghost"
        className="size-10 rounded-none"
        aria-label="Minimize window"
        onClick={() => void appWindow.minimize()}
      >
        <Minimize aria-hidden="true" className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="size-10 rounded-none"
        aria-label={maximized ? "Restore window" : "Maximize window"}
        onClick={() => void appWindow.toggleMaximize()}
      >
        {maximized ? (
          <Copy aria-hidden="true" className="size-3.5" />
        ) : (
          <Square aria-hidden="true" className="size-3.5" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="size-10 rounded-none hover:bg-destructive hover:text-destructive-foreground"
        aria-label="Close window"
        onClick={() => void appWindow.close()}
      >
        <X aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav
      aria-label="Application"
      className="flex min-h-0 flex-1 flex-col px-2 py-5 md:border-r md:border-sidebar-border"
    >
      <div className="min-h-0 flex-1">
        <p className="mb-2 px-2 text-sm text-muted-foreground">Library</p>
        <div className="space-y-1">
          {libraryItems.map((item) => (
            <NavigationLink
              item={item}
              key={item.to}
              active={isNavigationActive(pathname, item.to)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
      <NavigationLink
        item={settingsItem}
        active={isNavigationActive(pathname, settingsItem.to)}
        onNavigate={onNavigate}
      />
    </nav>
  );
}

function NavigationLink({
  item,
  active,
  onNavigate,
}: {
  item: NavigationItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      to={item.to}
      activeProps={{ "aria-current": "page" }}
      onClick={onNavigate}
      className={cn(
        "flex h-10 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active && "bg-muted text-foreground",
      )}
    >
      <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function isNavigationActive(pathname: string, to: NavigationItem["to"]) {
  return to === "/settings" ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}
