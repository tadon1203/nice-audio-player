<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import { cn } from "$lib/utils/cn.js";

  let {
    ref = $bindable(null),
    ...restProps
  }: PresentationProps<DropdownMenuPrimitive.RadioItemProps> = $props();
</script>

<DropdownMenuPrimitive.RadioItem
  bind:ref
  data-slot="menu-item"
  class={cn(
    "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-[state=checked]:text-foreground",
  )}
  {...restProps}
/>
