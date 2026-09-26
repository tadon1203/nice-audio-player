import { Album, LibraryBig, ListMusic, Settings2, type LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
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

export function Navigation({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
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
