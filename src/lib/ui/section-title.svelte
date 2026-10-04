<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils/cn.js";

  let {
    children,
    hidden = false,
    ...restProps
  }: PresentationProps<HTMLAttributes<HTMLHeadingElement>> & { hidden?: boolean } = $props();
</script>

<!-- A titled section within a workspace view. -->
<h2 class={cn("text-lg font-normal text-foreground", hidden && "sr-only")} {...restProps}>
  {@render children?.()}
</h2>
