import { tv, type VariantProps } from "tailwind-variants";
export const buttonVariants = tv({
    base: "font-medium focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg border border-transparent bg-clip-padding text-sm focus-visible:ring-3 aria-invalid:ring-3 active:not-aria-[haspopup]:translate-y-px [&_svg:not([class*='size-'])]:size-4 group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 aria-expanded:bg-muted aria-expanded:text-foreground",
        neutral:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        quiet:
          "hover:bg-muted hover:text-foreground dark:hover:bg-muted/50 aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/40 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        text: "text-muted-foreground hover:text-foreground hover:underline underline-offset-4",
        bare: "hover:text-foreground",
      },
      size: {
        compact: "h-7 gap-1 rounded-md px-2.5",
        standard: "h-8 gap-1.5 px-2.5",
        spacious: "h-9 gap-1.5 px-2.5",
        compactIcon: "size-7 rounded-md",
        icon: "size-8",
        largeIcon: "size-[36px]",
        inline: "h-auto gap-1 p-0 rounded-sm",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "standard",
    },
  });

  export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
  export type ButtonSize = VariantProps<typeof buttonVariants>["size"];
