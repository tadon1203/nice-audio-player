<script lang="ts" module>
  export type Side = "top" | "right" | "bottom" | "left";
</script>

<script lang="ts">
  import { floatingLayer } from "$lib/ui/floating-layer";
  import { Dialog as SheetPrimitive } from "bits-ui";
  import XIcon from "@lucide/svelte/icons/x";
  import { Button } from "$lib/ui/shadcn/button/index.js";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils/cn.js";
  import SheetOverlay from "./sheet-overlay.svelte";
  import SheetPortal from "./sheet-portal.svelte";
  import type { Snippet } from "svelte";
  import type { ComponentProps } from "svelte";

  let {
    ref = $bindable(null),
    side = "right",
    showCloseButton = true,
    overlay = true,
    class: className,
    surface = "acrylic",
    portalProps,
    children,
    ...restProps
  }: Omit<WithoutChildrenOrChild<SheetPrimitive.ContentProps>, "style"> & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SheetPortal>>;
    side?: Side;
    showCloseButton?: boolean;
    style?: never;
    surface?: "acrylic" | "opaque";
    /** A dimming backdrop; off for a panel that sits beside the page. */
    overlay?: boolean;
    children: Snippet;
  } = $props();
  const layer = floatingLayer("panel");
</script>

<SheetPortal {...portalProps}>
  {#if overlay}
    <SheetOverlay layer={layer - 1} />
  {/if}
  <SheetPrimitive.Content
    bind:ref
    data-slot="sheet-content"
    style={`z-index: ${layer}`}
    data-side={side}
    class={cn(
      "fixed  flex flex-col gap-4 bg-clip-padding text-sm motion-overlay data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
      surface === "acrylic" && "acrylic text-popover-foreground shadow-floating",
      surface === "opaque" && "bg-background text-foreground",
      className,
    )}
    {...restProps}
  >
    {@render children?.()}
    {#if showCloseButton}
      <SheetPrimitive.Close data-slot="sheet-close">
        {#snippet child({ props })}
          <div class="absolute top-3 right-3"><Button variant="quiet" size="compactIcon" {...props}>
            <XIcon />
            <span class="sr-only">Close</span>
          </Button></div>
        {/snippet}
      </SheetPrimitive.Close>
    {/if}
  </SheetPrimitive.Content>
</SheetPortal>
