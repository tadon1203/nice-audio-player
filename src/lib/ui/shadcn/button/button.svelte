<script lang="ts" module>
  import type { HTMLAnchorAttributes, HTMLButtonAttributes, HTMLAttributes } from "svelte/elements";
  import type { WithElementRef } from "$lib/utils/cn.js";
  import { controlButtonVariants, type ButtonPurpose, type ButtonDensity, type ButtonGeometry, type ButtonTypeRole } from "./control-styles";
  export type { ButtonPurpose, ButtonDensity, ButtonGeometry, ButtonTypeRole } from "./control-styles";
  export type ButtonProps = Omit<
    WithElementRef<HTMLAttributes<HTMLElement>> & Omit<HTMLButtonAttributes, keyof HTMLAttributes<HTMLElement>> & Omit<HTMLAnchorAttributes, keyof HTMLAttributes<HTMLElement>>,
    "class" | "style"
  > & {
    purpose?: ButtonPurpose;
    density?: ButtonDensity;
    geometry?: ButtonGeometry;
    stretch?: boolean;
    typeRole?: ButtonTypeRole;
    class?: never;
    style?: never;
    timeState?: "past" | "present" | "future";
  };
</script>

<script lang="ts">
  import { timeStateClass } from "$lib/ui/time-state";
  let {
    purpose = "neutral",
    density = "standard",
    geometry = "standard",
    stretch = false,
    typeRole = "emphasis",
    timeState,
    ref = $bindable(null),
    href = undefined,
    type = "button",
    disabled,
    children,
    ...restProps
  }: ButtonProps = $props();
</script>

{#if href}
  <a
    bind:this={ref}
    data-slot="button"
    class={[controlButtonVariants({ purpose, density, geometry, typeRole }), stretch && "w-full", timeState && timeStateClass(timeState)]}
    href={disabled ? undefined : href}
    aria-disabled={disabled}
    role={disabled ? "link" : undefined}
    tabindex={disabled ? -1 : undefined}
    {...restProps}
  >
    {@render children?.()}
  </a>
{:else}
  <button
    bind:this={ref}
    data-slot="button"
    class={[controlButtonVariants({ purpose, density, geometry, typeRole }), stretch && "w-full", timeState && timeStateClass(timeState)]}
    {type}
    {disabled}
    {...restProps}
  >
    {@render children?.()}
  </button>
{/if}
