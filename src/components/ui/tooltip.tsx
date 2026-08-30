import * as TooltipPrimitive from "@base-ui/react/tooltip";
import type { ComponentProps, ReactNode } from "react";

export const TooltipProvider = TooltipPrimitive.Tooltip.Provider;
export const Tooltip = TooltipPrimitive.Tooltip.Root;
export const TooltipTrigger = TooltipPrimitive.Tooltip.Trigger;
export function TooltipContent({
  children,
  side = "top",
  sideOffset = 6,
}: Omit<ComponentProps<typeof TooltipPrimitive.Tooltip.Popup>, "className"> & {
  side?: ComponentProps<typeof TooltipPrimitive.Tooltip.Positioner>["side"];
  sideOffset?: ComponentProps<typeof TooltipPrimitive.Tooltip.Positioner>["sideOffset"];
}) {
  return (
    <TooltipPrimitive.Tooltip.Portal>
      <TooltipPrimitive.Tooltip.Positioner side={side} sideOffset={sideOffset}>
        <TooltipPrimitive.Tooltip.Popup className="z-10 max-w-[240px] rounded-control border border-border-subtle bg-surface-raised px-2 py-1.5 text-caption text-text-primary">
          {children}
        </TooltipPrimitive.Tooltip.Popup>
      </TooltipPrimitive.Tooltip.Positioner>
    </TooltipPrimitive.Tooltip.Portal>
  );
}
export function TooltipPortal({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Tooltip.Portal>{children}</TooltipPrimitive.Tooltip.Portal>;
}
