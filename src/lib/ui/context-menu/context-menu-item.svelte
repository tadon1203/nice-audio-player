<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import { cn } from "$lib/utils/cn.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: ContextMenuPrimitive.ItemProps = $props();
</script>

<ContextMenuPrimitive.Item
  bind:ref
  data-slot="menu-item"
  class={cn(
    "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</ContextMenuPrimitive.Item>
