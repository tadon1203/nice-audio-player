<script lang="ts">
  import { floatingLayer } from "$lib/ui/floating-layer";
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import { cn } from "$lib/utils/cn.js";

  /** A floating menu opened from a button. Same surface as the context menu: Acrylic, layer 20. */
  let {
    ref = $bindable(null),
    children,
    width = "standard",
    ...restProps
  }: Omit<DropdownMenuPrimitive.ContentProps, "class" | "style"> & {
    class?: never;
    style?: never;
    width?: "compact" | "standard";
  } = $props();
  const layer = floatingLayer("popup");
</script>

<DropdownMenuPrimitive.Portal>
  <DropdownMenuPrimitive.Content
    bind:ref
    data-slot="menu-content"
    style={`z-index: ${layer}`}
    class={cn(
      "acrylic  origin-(--bits-dropdown-menu-content-transform-origin) rounded-lg p-1 text-sm text-popover-foreground shadow-floating ring-1 ring-foreground/10 outline-none motion-overlay",
      width === "compact" ? "min-w-40" : "min-w-44",
    )}
    {...restProps}
  >
    {@render children?.()}
  </DropdownMenuPrimitive.Content>
</DropdownMenuPrimitive.Portal>
