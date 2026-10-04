<script lang="ts" module>
  import { type VariantProps, tv } from "tailwind-variants";
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
  import type { WithElementRef } from "$lib/utils/cn.js";

  export const controlButtonVariants = tv({
    base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg border border-transparent bg-clip-padding text-sm focus-visible:ring-3 aria-invalid:ring-3 active:not-aria-[haspopup]:translate-y-px [&_svg:not([class*='size-'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    variants: {
      purpose: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 aria-expanded:bg-muted aria-expanded:text-foreground",
        neutral:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        quiet:
          "hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/40 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        "window-close": "hover:bg-destructive hover:text-destructive-foreground",
      },
      density: {
        compact: "h-7 gap-1 rounded-md px-2.5",
        standard: "h-8 gap-1.5 px-2.5",
        spacious: "h-9 gap-1.5 px-2.5",
        compactIcon: "size-7 rounded-md",
        icon: "size-8",
        titlebar: "size-10 rounded-none",
      },
      geometry: {
        standard: "",
        tableSort: "-mx-2 h-8 px-2",
      },
      typeRole: {
        label: "font-normal",
        emphasis: "font-medium",
      },
    },
    defaultVariants: {
      purpose: "neutral",
      density: "standard",
      geometry: "standard",
      typeRole: "emphasis",
    },
  });

  export type ButtonPurpose = VariantProps<typeof controlButtonVariants>["purpose"];
  export type ButtonDensity = VariantProps<typeof controlButtonVariants>["density"];
  export type ButtonGeometry = VariantProps<typeof controlButtonVariants>["geometry"];
  export type ButtonTypeRole = VariantProps<typeof controlButtonVariants>["typeRole"];
  export type ButtonProps = Omit<
    WithElementRef<HTMLButtonAttributes> & WithElementRef<HTMLAnchorAttributes>,
    "class" | "style"
  > & {
    purpose?: ButtonPurpose;
    density?: ButtonDensity;
    geometry?: ButtonGeometry;
    stretch?: boolean;
    typeRole?: ButtonTypeRole;
    class?: never;
    style?: never;
  };
</script>

<script lang="ts">
  let {
    purpose = "neutral",
    density = "standard",
    geometry = "standard",
    stretch = false,
    typeRole = "emphasis",
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
    class={[controlButtonVariants({ purpose, density, geometry, typeRole }), stretch && "w-full"]}
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
    class={[controlButtonVariants({ purpose, density, geometry, typeRole }), stretch && "w-full"]}
    {type}
    {disabled}
    {...restProps}
  >
    {@render children?.()}
  </button>
{/if}
