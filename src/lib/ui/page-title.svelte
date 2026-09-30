<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils/cn.js";

  let { class: className, children, ...restProps }: HTMLAttributes<HTMLHeadingElement> = $props();
</script>

<!-- The single h1 of a workspace view. -->
<h1
  class={cn("text-2xl leading-8 font-normal tracking-tight text-foreground", className)}
  {...restProps}
>
  {@render children?.()}
</h1>
