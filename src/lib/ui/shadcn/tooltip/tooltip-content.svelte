<script lang="ts">
  import { floatingLayer } from "$lib/ui/floating-layer";
  import { Tooltip as TooltipPrimitive } from "bits-ui";
  import { cn } from "$lib/utils/cn.js";
  import type { WithoutChildrenOrChild } from "$lib/utils/cn.js";
  import TooltipPortal from "./tooltip-portal.svelte";
  import type { ComponentProps } from "svelte";

  let {
    ref = $bindable(null),
    sideOffset = 0,
    side = "top",
    children,
    portalProps,
    ...restProps
  }: Omit<TooltipPrimitive.ContentProps, "class" | "style"> & {
    class?: never;
    style?: never;
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof TooltipPortal>>;
  } = $props();
  const layer = floatingLayer("popup");
</script>

<TooltipPortal {...portalProps}>
  <TooltipPrimitive.Content
    bind:ref
    data-slot="tooltip-content"
    style={`z-index: ${layer}`}
    {sideOffset}
    {side}
    class={cn(
      "acrylic inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:rounded-sm w-fit max-w-xs origin-(--bits-tooltip-content-transform-origin) text-popover-foreground shadow-floating ring-1 ring-foreground/10 motion-overlay",
    )}
    {...restProps}
  >
    {@render children?.()}
    <TooltipPrimitive.Arrow>
      {#snippet child({ props })}
        <div
          class={cn(
            "size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]  acrylic fill-popover data-[side=bottom]:-translate-x-1/2 data-[side=bottom]:-translate-y-[calc(-50%_+_1px)] data-[side=left]:-translate-y-[calc(50%_-_3px)] data-[side=right]:translate-x-[calc(50%_+_2px)] data-[side=right]:translate-y-1/2 data-[side=top]:translate-x-1/2 data-[side=top]:-translate-y-[calc(-50%_+_2px)]",
          )}
          {...props}
        ></div>
      {/snippet}
    </TooltipPrimitive.Arrow>
  </TooltipPrimitive.Content>
</TooltipPortal>
