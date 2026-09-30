<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils/cn.js";
  import { ScrollArea } from "$lib/ui/shadcn/scroll-area/index.js";
  import WorkspaceContainer from "./workspace-container.svelte";

  let {
    viewportRef = $bindable(null),
    class: className,
    contentClass,
    children,
  }: {
    viewportRef?: HTMLElement | null;
    class?: string;
    contentClass?: string;
    children: Snippet;
  } = $props();
</script>

<!--
  The one scroll region every workspace view uses. The scrollbar overlays the region edge, so it
  never changes the content width or its alignment with controls outside the region.
-->
<ScrollArea type="always" bind:viewportRef class={cn("h-full min-h-0 min-w-0", className)}>
  <WorkspaceContainer class={contentClass}>
    {@render children()}
  </WorkspaceContainer>
</ScrollArea>
