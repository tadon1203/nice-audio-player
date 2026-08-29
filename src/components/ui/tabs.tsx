import * as TabsPrimitive from "@base-ui/react/tabs";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Tabs.Root>) {
  return <TabsPrimitive.Tabs.Root {...props} className={cn("tabs", className)} />;
}
export function TabsList({
  className,
  variant = "line",
  ...props
}: ComponentProps<typeof TabsPrimitive.Tabs.List> & { variant?: "line" }) {
  return (
    <TabsPrimitive.Tabs.List
      {...props}
      className={cn("tabs-list", `tabs-list--${variant}`, className)}
    />
  );
}
export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Tabs.Tab>) {
  return <TabsPrimitive.Tabs.Tab {...props} className={cn("tabs-trigger", className)} />;
}
export function TabsContent({
  children,
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Tabs.Panel> & { children?: ReactNode }) {
  return (
    <TabsPrimitive.Tabs.Panel {...props} className={cn("tabs-content", className)}>
      {children}
    </TabsPrimitive.Tabs.Panel>
  );
}
