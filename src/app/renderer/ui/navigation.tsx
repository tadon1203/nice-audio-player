import { useId } from "react";
import { LayoutGroup, m } from "motion/react";
import { Album, LibraryBig, ListMusic, Settings2, type LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/renderer/shared/lib/utils";
import { useMotionTransition } from "@/renderer/shared/ui/motion";
import { buttonVariants } from "@/renderer/shared/ui/shadcn/button";

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
  // The selection pill slides between items. Scoped per instance: the desktop sidebar and the
  // mobile sheet can both be mounted.
  const groupId = useId();

  return (
    <LayoutGroup id={groupId}>
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
    </LayoutGroup>
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
  const transition = useMotionTransition("smallMove");

  return (
    <Link
      to={item.to}
      activeProps={{ "aria-current": "page" }}
      onClick={onNavigate}
      className={cn(
        buttonVariants({ variant: "ghost", size: "lg" }),
        "relative h-10 w-full justify-start gap-2 px-2 text-muted-foreground hover:bg-sidebar-accent",
        active && "text-foreground",
      )}
    >
      {active ? (
        <m.span
          layoutId="navigation-selection"
          aria-hidden="true"
          transition={transition}
          className="absolute inset-0 bg-muted"
          style={{ borderRadius: 6 }}
        />
      ) : null}
      <Icon aria-hidden="true" className="relative" />
      <span className="relative truncate">{item.label}</span>
    </Link>
  );
}

function isNavigationActive(pathname: string, to: NavigationItem["to"]) {
  return to === "/settings" ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}
