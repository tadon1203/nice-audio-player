import { tv, type VariantProps } from "tailwind-variants";
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
        text: "text-muted-foreground hover:text-foreground hover:underline underline-offset-4",
        bare: "hover:text-foreground",
        transport: "relative rounded-full bg-primary text-primary-foreground active:translate-y-0 active:scale-[0.94] disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100",
        toggle: "relative text-muted-foreground aria-pressed:text-foreground hover:bg-muted hover:text-foreground",
      },
      density: {
        compact: "h-7 gap-1 rounded-md px-2.5",
        standard: "h-8 gap-1.5 px-2.5",
        spacious: "h-9 gap-1.5 px-2.5",
        compactIcon: "size-7 rounded-md",
        icon: "size-8",
        largeIcon: "size-[36px]",
        sleeve: "size-16 p-0",
        inline: "h-auto gap-1 p-0 rounded-sm",
        titlebar: "size-10 rounded-none",
      },
      geometry: {
        standard: "",
        tableSort: "-mx-2 h-8 px-2",
        navigation: "relative h-10 w-full justify-start gap-2 px-2 text-muted-foreground aria-current:text-foreground hover:bg-sidebar-accent",
        sleeve: "grid aspect-square overflow-hidden rounded-lg",
        title: "block max-w-full truncate text-left text-foreground",
        rowOverlay: "absolute inset-0 size-full cursor-pointer focus-visible:ring-inset active:translate-y-0",
        drag: "relative z-10 -ml-2 cursor-grab touch-none p-1 active:cursor-grabbing",
        gutter: "relative w-16 shrink-0 justify-end text-right tabular-nums",
        queueRow: "flex w-full items-center gap-4 rounded-sm py-2 text-left whitespace-normal disabled:opacity-100 active:translate-y-0",
        index: "h-auto min-h-6 w-auto min-w-6 shrink-0 px-1 py-0.5 font-normal",
        clip: "h-auto min-w-8 p-0 tabular-nums",
        round: "rounded-full",
        strip: "relative h-full w-full cursor-pointer rounded-full border-0 before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] disabled:cursor-default disabled:opacity-100",
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
