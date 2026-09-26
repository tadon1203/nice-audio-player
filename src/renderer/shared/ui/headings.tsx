import type { ComponentProps } from "react";
import { cn } from "@/renderer/shared/lib/utils";

/** The single `h1` of a workspace view. */
export function PageTitle({ className, ...props }: ComponentProps<"h1">) {
  return (
    <h1
      className={cn("text-2xl font-normal leading-8 tracking-tight text-foreground", className)}
      {...props}
    />
  );
}

/** A titled section within a workspace view. */
export function SectionTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-lg font-medium text-foreground", className)} {...props} />;
}
