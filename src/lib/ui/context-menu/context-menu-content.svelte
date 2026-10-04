<script lang="ts" module>
  import type { ContextMenu as ContextMenuPrimitiveTypes } from "bits-ui";
  export type ContextMenuContentProps = Omit<
    ContextMenuPrimitiveTypes.ContentProps,
    "class" | "style"
  > & {
    class?: never;
    style?: never;
    width?: "compact" | "standard";
  };
</script>

<script lang="ts">
  import { floatingLayer } from "$lib/ui/floating-layer";
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import { cn } from "$lib/utils/cn.js";

  /**
   * A floating menu. It sits on Acrylic (never Light) at layer 20 and opens where the pointer
   * summoned it.
   */
  let {
    ref = $bindable(null),
    children,
    width = "standard",
    ...restProps
  }: ContextMenuContentProps = $props();
  const layer = floatingLayer("popup");
</script>

<ContextMenuPrimitive.Portal>
  <ContextMenuPrimitive.Content
    bind:ref
    data-slot="menu-content"
    style={`z-index: ${layer}`}
    class={cn(
      "acrylic  origin-(--bits-context-menu-content-transform-origin) rounded-lg p-1 text-sm text-popover-foreground shadow-floating ring-1 ring-foreground/10 outline-none motion-overlay",
      width === "compact" ? "min-w-40" : "min-w-44",
    )}
    {...restProps}
  >
    {@render children?.()}
  </ContextMenuPrimitive.Content>
</ContextMenuPrimitive.Portal>
