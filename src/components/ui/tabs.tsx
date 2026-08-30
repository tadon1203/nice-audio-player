import * as TabsPrimitive from "@base-ui/react/tabs";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Tabs.Root>) {
  return (
    <TabsPrimitive.Tabs.Root
      {...props}
      data-slot="tabs-root"
      className={cn("min-w-0", className)}
    />
  );
}
export function TabsList({
  className,
  variant: _variant = "line",
  ...props
}: ComponentProps<typeof TabsPrimitive.Tabs.List> & { variant?: "line" }) {
  return <TabsPrimitive.Tabs.List {...props} className={cn("inline-flex gap-6", className)} />;
}
export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Tabs.Tab>) {
  return (
    <TabsPrimitive.Tabs.Tab
      {...props}
      className={cn(
        "relative min-h-10 border-0 bg-transparent p-0 text-text-secondary data-[active]:text-text-primary data-[active]:after:absolute data-[active]:after:inset-x-0 data-[active]:after:bottom-0 data-[active]:after:h-0.5 data-[active]:after:bg-text-primary",
        className,
      )}
    />
  );
}
export function TabsContent({
  children,
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Tabs.Panel> & { children?: ReactNode }) {
  return (
    <TabsPrimitive.Tabs.Panel {...props} className={cn("min-h-0 overflow-hidden", className)}>
      {children}
    </TabsPrimitive.Tabs.Panel>
  );
}
