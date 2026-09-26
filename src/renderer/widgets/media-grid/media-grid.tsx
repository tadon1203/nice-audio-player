import type { ComponentProps } from "react";
import { cn } from "@/renderer/shared/lib/utils";

export function MediaGrid({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(auto-fill,12rem)] justify-start gap-x-5 gap-y-8",
        className,
      )}
      {...props}
    />
  );
}
