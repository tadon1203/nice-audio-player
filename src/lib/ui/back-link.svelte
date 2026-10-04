<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import { cn } from "$lib/utils/cn.js";

  let { children, ...restProps }: PresentationProps<HTMLAnchorAttributes> = $props();
</script>

<!-- Returns to the semantic parent of a detail view. -->
<a
  class={cn(
    "inline-flex items-center gap-2 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
  )}
  {...restProps}
>
  <ArrowLeft aria-hidden="true" class="size-4" />
  {@render children?.()}
</a>
