import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva("", {
  variants: {
    variant: {
      neutral:
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-border-control bg-transparent px-4 py-2 text-text-primary transition-colors duration-[var(--effect-feedback)] ease-interface hover:not-disabled:bg-surface-hover active:not-disabled:bg-surface-pressed disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-text-disabled",
      filled:
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-surface border border-transparent bg-action-filled px-4 py-2 text-action-filled-foreground transition-colors duration-[var(--effect-feedback)] ease-interface hover:not-disabled:bg-action-filled-hover active:not-disabled:bg-action-filled-pressed disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-text-disabled",
      danger:
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-error bg-transparent px-4 py-2 text-error transition-colors duration-[var(--effect-feedback)] ease-interface hover:not-disabled:bg-error-surface hover:not-disabled:text-text-primary active:not-disabled:bg-error active:not-disabled:text-canvas disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-text-disabled",
      icon: "relative grid h-10 w-10 min-h-10 min-w-10 flex-none place-items-center rounded-control border border-transparent bg-transparent p-0 text-text-secondary transition-colors duration-[var(--effect-feedback)] ease-interface hover:not-disabled:bg-surface-hover hover:not-disabled:text-text-primary active:not-disabled:bg-surface-pressed disabled:cursor-not-allowed disabled:text-text-disabled aria-pressed:border-border-control aria-pressed:bg-surface-pressed aria-pressed:text-text-primary data-[pressed]:border-border-control data-[pressed]:bg-surface-pressed data-[pressed]:text-text-primary [&_svg]:h-5 [&_svg]:w-5",
      "icon-primary":
        "relative grid h-10 w-10 min-h-10 min-w-10 flex-none place-items-center rounded-control border border-transparent bg-transparent p-0 text-text-primary transition-colors duration-[var(--effect-feedback)] ease-interface hover:not-disabled:bg-surface-hover active:not-disabled:bg-surface-pressed disabled:cursor-not-allowed disabled:text-text-disabled [&_svg]:h-5 [&_svg]:w-5",
      transport:
        "grid h-12 w-12 min-h-12 min-w-12 flex-none place-items-center rounded-full border-0 bg-text-primary p-0 text-canvas transition-opacity duration-[var(--effect-state)] ease-interface hover:not-disabled:opacity-[.85] active:not-disabled:bg-text-primary disabled:bg-surface-pressed disabled:text-text-disabled disabled:opacity-80 [&_svg]:h-6 [&_svg]:w-6",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface ButtonProps
  extends Omit<BaseButton.Props, "className">, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
  { variant, ...props },
  ref,
) {
  return <BaseButton ref={ref} {...props} className={cn(buttonVariants({ variant }))} />;
});
