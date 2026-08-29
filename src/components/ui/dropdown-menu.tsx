import * as Menu from "@base-ui/react/menu";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = Menu.Menu.Root;
export const DropdownMenuTrigger = Menu.Menu.Trigger;
export function DropdownMenuGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Menu.Menu.Group className={cn("dropdown-menu__group", className)}>{children}</Menu.Menu.Group>
  );
}
export function DropdownMenuContent({
  children,
  className,
  side = "bottom",
  align = "end",
  sideOffset = 8,
}: {
  children: ReactNode;
  className?: string;
  side?: ComponentProps<typeof Menu.Menu.Positioner>["side"];
  align?: ComponentProps<typeof Menu.Menu.Positioner>["align"];
  sideOffset?: ComponentProps<typeof Menu.Menu.Positioner>["sideOffset"];
}) {
  return (
    <Menu.Menu.Portal>
      <Menu.Menu.Positioner side={side} align={align} sideOffset={sideOffset}>
        <Menu.Menu.Popup className={cn("dropdown-menu__content", className)}>
          {children}
        </Menu.Menu.Popup>
      </Menu.Menu.Positioner>
    </Menu.Menu.Portal>
  );
}

type DropdownMenuItemProps = Omit<Menu.Menu.Item.Props, "className"> & {
  className?: string;
  variant?: "default" | "destructive";
};

export function DropdownMenuItem({
  children,
  className,
  variant = "default",
  ...props
}: DropdownMenuItemProps) {
  return (
    <Menu.Menu.Item
      {...props}
      className={cn(
        "dropdown-menu__item",
        variant === "destructive" && "dropdown-menu__item--destructive",
        className,
      )}
    >
      {children}
    </Menu.Menu.Item>
  );
}
