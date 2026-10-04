<script lang="ts" module>
  import type { HTMLAnchorAttributes, HTMLButtonAttributes, HTMLAttributes } from "svelte/elements";
  import type { WithElementRef } from "$lib/utils/cn.js";
  import type { ButtonVariant, ButtonSize } from "./control-styles";
  export type { ButtonVariant, ButtonSize } from "./control-styles";
  export type ButtonProps =
    WithElementRef<HTMLAttributes<HTMLElement>> &
    Omit<HTMLButtonAttributes, keyof HTMLAttributes<HTMLElement>> &
    Omit<HTMLAnchorAttributes, keyof HTMLAttributes<HTMLElement>> & {
      variant?: ButtonVariant;
      size?: ButtonSize;
    };
</script>

<script lang="ts">
  import { cn } from "$lib/utils/cn.js";
  import { buttonVariants } from "./control-styles";
  let {
    variant = "neutral",
    size = "standard",
    class: className,
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
    class={cn(buttonVariants({ variant, size }), className)}
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
    class={cn(buttonVariants({ variant, size }), className)}
    {type}
    {disabled}
    {...restProps}
  >
    {@render children?.()}
  </button>
{/if}
