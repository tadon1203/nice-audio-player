<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils/cn.js";

  let { children, class: className, ...restProps }: HTMLAttributes<HTMLHeadingElement> = $props();
</script>

<!-- A titled section within a workspace view. -->
<h2 class={cn("text-lg font-normal text-foreground", className)} {...restProps}>
  {@render children?.()}
</h2>
