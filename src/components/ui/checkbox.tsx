import * as CheckboxPrimitive from "@base-ui/react/checkbox";
import { forwardRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxPrimitive.Checkbox.Root.Props>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <CheckboxPrimitive.Checkbox.Root
        ref={ref}
        {...props}
        data-slot="checkbox"
        className={cn("checkbox", className)}
      >
        <CheckboxPrimitive.Checkbox.Indicator
          data-slot="checkbox-indicator"
          className="checkbox__indicator"
        >
          <Check className="checkbox__check" aria-hidden="true" focusable="false" />
        </CheckboxPrimitive.Checkbox.Indicator>
      </CheckboxPrimitive.Checkbox.Root>
    );
  },
);
