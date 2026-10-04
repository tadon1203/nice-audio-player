<script lang="ts" module>
  import type { Select as SelectPrimitiveTypes } from "bits-ui";
  import type {
    WithoutChild as WithoutChildType,
    WithoutChildrenOrChild as WithoutChildrenOrChildType,
  } from "$lib/utils/cn.js";
  import type { ComponentProps as ComponentPropsType } from "svelte";
  export type SelectContentProps = Omit<
    WithoutChildType<SelectPrimitiveTypes.ContentProps>,
    "class" | "style"
  > & {
    class?: never;
    style?: never;
    portalProps?: WithoutChildrenOrChildType<
      ComponentPropsType<typeof import("./select-portal.svelte").default>
    >;
  };
</script>

<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import { cn } from "$lib/utils/cn.js";
  import SelectPortal from "./select-portal.svelte";
  import SelectScrollDownButton from "./select-scroll-down-button.svelte";
  import SelectScrollUpButton from "./select-scroll-up-button.svelte";

  let {
    ref = $bindable(null),
    sideOffset = 4,
    portalProps,
    children,
    preventScroll = true,
    ...restProps
  }: SelectContentProps = $props();
</script>

<SelectPortal {...portalProps}>
  <SelectPrimitive.Content
    bind:ref
    {sideOffset}
    {preventScroll}
    data-slot="select-content"
    class={cn(
      "acrylic text-popover-foreground ring-foreground/10 min-w-36 rounded-lg shadow-floating ring-1 relative z-50 max-h-(--bits-select-content-available-height) origin-(--bits-select-content-transform-origin) overflow-x-hidden overflow-y-auto motion-overlay",
    )}
    {...restProps}
  >
    <SelectScrollUpButton />
    <SelectPrimitive.Viewport
      class={cn(
        "h-(--bits-select-anchor-height) w-full min-w-(--bits-select-anchor-width) scroll-my-1",
      )}
    >
      {@render children?.()}
    </SelectPrimitive.Viewport>
    <SelectScrollDownButton />
  </SelectPrimitive.Content>
</SelectPortal>
