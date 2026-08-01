import type { ReactNode } from "react";

interface ResponsiveClusterProps {
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}

export function ResponsiveCluster({
  children,
  className,
  align = "start",
}: ResponsiveClusterProps) {
  return (
    <div className={className} data-layout="cluster" data-align={align} data-wraps>
      {children}
    </div>
  );
}
