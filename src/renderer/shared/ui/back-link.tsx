import type { ComponentProps, Ref } from "react";
import { createLink, type LinkComponent } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/renderer/shared/lib/utils";

function BackAnchor({
  className,
  children,
  ref,
  ...props
}: ComponentProps<"a"> & { ref?: Ref<HTMLAnchorElement> }) {
  return (
    <a
      ref={ref}
      className={cn(
        "inline-flex items-center gap-2 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {children}
    </a>
  );
}

const RouterBackAnchor = createLink(BackAnchor);

/** Returns to the semantic parent of a detail view; a type-checked router link. */
export const BackLink: LinkComponent<typeof BackAnchor> = (props) => (
  <RouterBackAnchor {...props} />
);
