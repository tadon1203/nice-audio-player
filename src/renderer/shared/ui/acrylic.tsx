import type { ComponentProps } from "react";
import { cn } from "@/renderer/shared/lib/utils";

/**
 * Surface for floating UI (menus, dialogs, sheets, sticky headers). Acrylic replaces
 * Light there: it blurs whatever scrolls underneath. See the `acrylic` utility in styles.css.
 */
export function Acrylic({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="acrylic" className={cn("acrylic", className)} {...props} />;
}
