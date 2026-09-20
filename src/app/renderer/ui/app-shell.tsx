import { Album, LibraryBig, ListMusic, Settings2, type LucideIcon } from "lucide-react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PlaybackRegion } from "@/renderer/widgets/playback-region";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/renderer/shared/ui/sidebar";
import { buttonVariants } from "@/renderer/shared/ui/button";

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

  return (
    <div className="grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_88px] bg-background">
      <SidebarProvider
        className="h-full min-h-0 w-full flex-1"
        style={{ "--sidebar-width": "224px" } as React.CSSProperties}
      >
        <div
          className="relative grid h-full min-h-0 min-w-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] app-wide:grid-cols-[224px_minmax(0,1fr)] app-wide:grid-rows-1"
          data-slot="app-workspace"
        >
          <nav
            className="flex min-h-0 flex-wrap items-center gap-1 border-b border-border bg-sidebar px-4 py-2 app-wide:hidden"
            aria-label="Application"
          >
            {[...libraryItems, settingsItem].map((item) => (
              <NarrowNavigationLink
                item={item}
                key={item.to}
                active={isNavigationActive(pathname, item.to)}
              />
            ))}
          </nav>

          <Sidebar
            collapsible="none"
            role="navigation"
            aria-label="Application"
            className="hidden min-h-0 border-r border-sidebar-border app-wide:flex"
          >
            <SidebarContent className="px-3 pt-7 pb-3">
              <SidebarGroup>
                <SidebarGroupLabel className="mb-2 px-3 text-sm font-normal text-sidebar-foreground">
                  Library
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {libraryItems.map((item) => (
                      <WideNavigationLink
                        item={item}
                        key={item.to}
                        active={isNavigationActive(pathname, item.to)}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="px-3 pb-5">
              <SidebarMenu>
                <WideNavigationLink
                  item={settingsItem}
                  active={isNavigationActive(pathname, settingsItem.to)}
                />
              </SidebarMenu>
            </SidebarFooter>
          </Sidebar>

          <main
            className="col-start-1 row-start-2 min-h-0 min-w-0 overflow-hidden app-wide:col-start-2 app-wide:row-start-1"
            data-slot="app-main"
          >
            <Outlet />
          </main>
        </div>
      </SidebarProvider>

      <PlaybackRegion />
    </div>
  );
}

function WideNavigationLink({ item, active }: { item: NavigationItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to={item.to} activeProps={{ "aria-current": "page" }} />}
        isActive={active}
        className="h-10 rounded-md px-3 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground data-active:bg-muted data-active:text-foreground"
      >
        <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NarrowNavigationLink({ item, active }: { item: NavigationItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      activeProps={{ "aria-current": "page" }}
      className={buttonVariants({
        variant: "ghost",
        size: "default",
        className:
          "min-w-0 flex-1 justify-center gap-2 px-2 text-muted-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground",
      })}
      aria-current={active ? "page" : undefined}
      title={item.label}
    >
      <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function isNavigationActive(pathname: string, to: NavigationItem["to"]) {
  return to === "/settings" ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}
