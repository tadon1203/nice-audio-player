import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva("button", {
  variants: {
    variant: {
      default: "button--filled",
      filled: "button--filled",
      outline: "button--neutral",
      ghost: "button--neutral",
      neutral: "button--neutral",
      destructive: "button--danger",
      danger: "button--danger",
    },
    size: {
      default: "",
      sm: "",
      lg: "",
      icon: "icon-button",
      "icon-lg": "icon-button icon-button--lg",
    },
  },
  defaultVariants: { variant: "outline", size: "default" },
});

export interface ButtonProps extends BaseButton.Props, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
  { className, variant, size, ...props },
  ref,
) {
  return (
    <BaseButton ref={ref} {...props} className={cn(buttonVariants({ variant, size }), className)} />
  );
});
