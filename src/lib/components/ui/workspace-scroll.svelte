<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "#lib/utils/cn.js";
  import { ScrollArea } from "#lib/components/ui/shadcn/scroll-area/index.js";
  import type { Attachment } from "svelte/attachments";
  import { ScrollView } from "./scroll-view.svelte";
  import WorkspaceContainer from "./workspace-container.svelte";

  let {
    viewportAttachment,
    class: className,
    contentClass,
    children,
  }: {
    /** Runs on the scrolling viewport; the page's scroll rules attach here. */
    viewportAttachment?: Attachment<HTMLElement>;
    class?: string;
    contentClass?: string;
    children: Snippet;
  } = $props();

  const scrollView = ScrollView.provide();
  const attachViewport: Attachment<HTMLElement> = (node) => {
    const stopViewport = scrollView.attachViewport(node);
    const stopCaller = viewportAttachment?.(node);
    return (): void => {
      stopViewport?.();
      stopCaller?.();
    };
  };
</script>

<!--
  The one scroll region every workspace view uses. The scrollbar overlays the region edge, so it
  never changes the content width or its alignment with controls outside the region.
-->
<ScrollArea
  type="always"
  viewportAttachment={attachViewport}
  class={cn("h-full min-h-0 min-w-0", className)}
>
  <WorkspaceContainer class={contentClass} {@attach scrollView.attachContent}>
    {@render children()}
  </WorkspaceContainer>
</ScrollArea>
