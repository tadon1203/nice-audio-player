import * as Menu from "@base-ui/react/menu";
import type { ComponentProps, ReactNode } from "react";

export const DropdownMenu = Menu.Menu.Root;
export const DropdownMenuTrigger = Menu.Menu.Trigger;
export function DropdownMenuGroup({ children }: { children: ReactNode }) {
  return <Menu.Menu.Group className="grid gap-0.5">{children}</Menu.Menu.Group>;
}
export function DropdownMenuContent({
  children,
  side = "bottom",
  align = "end",
  sideOffset = 8,
}: {
  children: ReactNode;
  side?: ComponentProps<typeof Menu.Menu.Positioner>["side"];
  align?: ComponentProps<typeof Menu.Menu.Positioner>["align"];
  sideOffset?: ComponentProps<typeof Menu.Menu.Positioner>["sideOffset"];
}) {
  return (
    <Menu.Menu.Portal>
      <Menu.Menu.Positioner side={side} align={align} sideOffset={sideOffset}>
        <Menu.Menu.Popup className="z-[4] min-w-[180px] rounded-surface border border-border-subtle bg-surface-raised p-1">
          {children}
        </Menu.Menu.Popup>
      </Menu.Menu.Positioner>
    </Menu.Menu.Portal>
  );
}

type DropdownMenuItemProps = Omit<Menu.Menu.Item.Props, "className"> & {
  variant?: "default" | "destructive";
};

export function DropdownMenuItem({
  children,
  variant = "default",
  ...props
}: DropdownMenuItemProps) {
  return (
    <Menu.Menu.Item
      {...props}
      className={`flex min-h-10 w-full items-center rounded-control border-0 bg-transparent px-3 text-start text-text-primary hover:bg-surface-hover data-[disabled]:cursor-not-allowed data-[disabled]:text-text-disabled data-[highlighted]:bg-surface-hover ${variant === "destructive" ? "text-error" : ""}`}
    >
      {children}
    </Menu.Menu.Item>
  );
}
