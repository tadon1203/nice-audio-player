import type { ComponentProps } from "react";
import { cn } from "@/renderer/shared/lib/utils";

/** A left-filling grid of media tiles; each child is a list item. */
export function MediaGrid({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "grid grid-cols-[repeat(auto-fill,12rem)] justify-start gap-x-5 gap-y-8",
        className,
      )}
      {...props}
    />
  );
}
