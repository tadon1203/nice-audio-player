<script lang="ts">
  import { floatingLayer } from "$lib/ui/floating-layer";
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import { cn, type WithoutChild, type WithoutChildrenOrChild } from "$lib/utils/cn.js";
  import AlertDialogOverlay from "./alert-dialog-overlay.svelte";
  import AlertDialogPortal from "./alert-dialog-portal.svelte";
  import type { ComponentProps } from "svelte";

  let {
    ref = $bindable(null),
    size = "default",
    portalProps,
    ...restProps
  }: Omit<WithoutChild<AlertDialogPrimitive.ContentProps>, "class" | "style"> & {
    class?: never;
    style?: never;
    size?: "default" | "sm";
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialogPortal>>;
  } = $props();
  const layer = floatingLayer("dialog");
</script>

<AlertDialogPortal {...portalProps}>
  <AlertDialogOverlay layer={layer - 1} />
  <AlertDialogPrimitive.Content
    bind:ref
    data-slot="alert-dialog-content"
    style={`z-index: ${layer}`}
    data-size={size}
    class={cn(
      "acrylic text-popover-foreground ring-foreground/10 gap-4 rounded-xl p-4 shadow-floating ring-1 data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm group/alert-dialog-content fixed top-1/2 left-1/2  grid w-full -translate-x-1/2 -translate-y-1/2 outline-none motion-overlay",
    )}
    {...restProps}
  />
</AlertDialogPortal>
