<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import { cn } from "$lib/utils/cn.js";

  /**
   * A floating menu. It sits on Acrylic (never Light) at layer 20 and opens where the pointer
   * summoned it.
   */
  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: ContextMenuPrimitive.ContentProps = $props();
</script>

<ContextMenuPrimitive.Portal>
  <ContextMenuPrimitive.Content
    bind:ref
    data-slot="menu-content"
    class={cn(
      "acrylic data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 z-20 min-w-44 origin-(--bits-context-menu-content-transform-origin) rounded-lg p-1 text-sm text-popover-foreground shadow-floating ring-1 ring-foreground/10 outline-none duration-100",
      className,
    )}
    {...restProps}
  >
    {@render children?.()}
  </ContextMenuPrimitive.Content>
</ContextMenuPrimitive.Portal>
