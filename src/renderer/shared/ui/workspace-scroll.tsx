import type { ReactNode, Ref } from "react";
import { cn } from "@/renderer/shared/lib/utils";
import { ScrollArea } from "@/renderer/shared/ui/shadcn/scroll-area";
import { WorkspaceContainer } from "./workspace-container";

/**
 * The one scroll region every workspace view uses. The scrollbar overlays the
 * region's right edge, so it never changes the content width or its alignment
 * with controls placed outside the region.
 */
export function WorkspaceScroll({
  scrollRestorationId,
  viewportRef,
  className,
  contentClassName,
  children,
}: {
  scrollRestorationId: string;
  viewportRef?: Ref<HTMLDivElement>;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <ScrollArea
      className={cn("h-full min-h-0 min-w-0", className)}
      viewportRef={viewportRef}
      viewportProps={{ "data-scroll-restoration-id": scrollRestorationId }}
    >
      <WorkspaceContainer className={contentClassName}>{children}</WorkspaceContainer>
    </ScrollArea>
  );
}
