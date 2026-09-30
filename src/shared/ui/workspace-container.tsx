import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

export function WorkspaceContainer({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("w-full px-6 lg:px-10", className)} {...props} />;
}
