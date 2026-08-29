import * as TooltipPrimitive from "@base-ui/react/tooltip";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Tooltip.Provider;
export const Tooltip = TooltipPrimitive.Tooltip.Root;
export const TooltipTrigger = TooltipPrimitive.Tooltip.Trigger;
export function TooltipContent({
  children,
  className,
  side = "top",
  sideOffset = 6,
}: ComponentProps<typeof TooltipPrimitive.Tooltip.Popup> & {
  side?: ComponentProps<typeof TooltipPrimitive.Tooltip.Positioner>["side"];
  sideOffset?: ComponentProps<typeof TooltipPrimitive.Tooltip.Positioner>["sideOffset"];
}) {
  return (
    <TooltipPrimitive.Tooltip.Portal>
      <TooltipPrimitive.Tooltip.Positioner side={side} sideOffset={sideOffset}>
        <TooltipPrimitive.Tooltip.Popup className={cn("tooltip__content", className)}>
          {children}
        </TooltipPrimitive.Tooltip.Popup>
      </TooltipPrimitive.Tooltip.Positioner>
    </TooltipPrimitive.Tooltip.Portal>
  );
}
export function TooltipPortal({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Tooltip.Portal>{children}</TooltipPrimitive.Tooltip.Portal>;
}
