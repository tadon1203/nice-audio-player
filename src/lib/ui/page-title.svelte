<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils/cn.js";

  let { children, ...restProps }: PresentationProps<HTMLAttributes<HTMLHeadingElement>> = $props();
</script>

<!-- The single h1 of a workspace view. -->
<h1 class={cn("text-2xl leading-8 font-normal tracking-tight text-foreground")} {...restProps}>
  {@render children?.()}
</h1>
