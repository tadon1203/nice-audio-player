<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "#lib/utils/cn.js";
  import { ScrollArea } from "#lib/ui/shadcn/scroll-area/index.js";
  import WorkspaceContainer from "./workspace-container.svelte";

  import type { Attachment } from "svelte/attachments";

  let {
    viewportRef = $bindable(null),
    viewportAttachment,
    class: className,
    contentClass,
    children,
  }: {
    viewportRef?: HTMLElement | null;
    /** Runs on the scrolling viewport; the page's scroll rules attach here. */
    viewportAttachment?: Attachment<HTMLElement>;
    class?: string;
    contentClass?: string;
    children: Snippet;
  } = $props();
</script>

<!--
  The one scroll region every workspace view uses. The scrollbar overlays the region edge, so it
  never changes the content width or its alignment with controls outside the region.
-->
<ScrollArea
  type="always"
  bind:viewportRef
  {viewportAttachment}
  class={cn("h-full min-h-0 min-w-0", className)}
>
  <WorkspaceContainer class={contentClass}>
    {@render children()}
  </WorkspaceContainer>
</ScrollArea>
