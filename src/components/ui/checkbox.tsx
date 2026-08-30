import * as CheckboxPrimitive from "@base-ui/react/checkbox";
import { forwardRef } from "react";
import { Check } from "lucide-react";

export const Checkbox = forwardRef<
  HTMLButtonElement,
  Omit<CheckboxPrimitive.Checkbox.Root.Props, "className">
>(function Checkbox(props, ref) {
  return (
    <CheckboxPrimitive.Checkbox.Root
      ref={ref}
      {...props}
      data-slot="checkbox"
      className="grid h-[18px] w-[18px] flex-none place-items-center rounded-control border border-border-control bg-transparent text-canvas data-[checked]:border-action-filled data-[checked]:bg-action-filled data-[disabled]:cursor-not-allowed data-[disabled]:opacity-[.55] data-[focused]:outline-2 data-[focused]:outline-focus-ring data-[focused]:outline-offset-2"
    >
      <CheckboxPrimitive.Checkbox.Indicator data-slot="checkbox-indicator" className="inline-flex">
        <Check className="h-3.5 w-3.5" aria-hidden="true" focusable="false" />
      </CheckboxPrimitive.Checkbox.Indicator>
    </CheckboxPrimitive.Checkbox.Root>
  );
});
