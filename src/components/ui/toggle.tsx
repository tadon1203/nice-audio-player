import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export const Toggle = forwardRef<HTMLButtonElement, BaseToggle.Props>(function Toggle(
  { className, ...props },
  ref,
) {
  return (
    <BaseToggle
      ref={ref}
      {...props}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), className)}
    />
  );
});
