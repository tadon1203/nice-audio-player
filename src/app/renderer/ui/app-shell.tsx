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
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/renderer/shared/ui/shadcn/sidebar";

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
      <SidebarProvider className="relative h-full w-full overflow-hidden" style={{ minHeight: 0 }}>
        <Sidebar style={{ position: "absolute", height: "100%" }}>
          <nav aria-label="Application" className="flex min-h-0 flex-1 flex-col">
            <SidebarContent className="pt-7 pb-3">
              <SidebarGroup>
                <SidebarGroupLabel className="mb-2 text-sm font-normal">
                  Library
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {libraryItems.map((item) => (
                      <NavigationLink
                        item={item}
                        key={item.to}
                        active={isNavigationActive(pathname, item.to)}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="pb-5">
              <SidebarMenu>
                <NavigationLink
                  item={settingsItem}
                  active={isNavigationActive(pathname, settingsItem.to)}
                />
              </SidebarMenu>
            </SidebarFooter>
          </nav>
        </Sidebar>

        <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
          <div className="flex h-12 shrink-0 items-center border-b border-border bg-background px-4 md:hidden">
            <SidebarTrigger aria-label="Open navigation" />
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden" data-slot="app-main">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>

      <PlaybackRegion />
    </div>
  );
}

function NavigationLink({ item, active }: { item: NavigationItem; active: boolean }) {
  const Icon = item.icon;
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to={item.to} activeProps={{ "aria-current": "page" }} />}
        isActive={active}
        className="h-10 text-sm text-muted-foreground hover:text-foreground data-active:bg-muted data-active:text-foreground"
        onClick={() => {
          if (isMobile) setOpenMobile(false);
        }}
      >
        <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function isNavigationActive(pathname: string, to: NavigationItem["to"]) {
  return to === "/settings" ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}
