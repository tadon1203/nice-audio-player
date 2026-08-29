import * as SelectPrimitive from "@base-ui/react/select";
import type { ComponentProps, ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Select = SelectPrimitive.Select.Root;

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Select.Trigger>) {
  return (
    <SelectPrimitive.Select.Trigger {...props} className={cn("select__trigger", className)}>
      {children}
      <SelectPrimitive.Select.Icon className="select__icon">
        <ChevronDown aria-hidden="true" focusable="false" />
      </SelectPrimitive.Select.Icon>
    </SelectPrimitive.Select.Trigger>
  );
}

export const SelectValue = SelectPrimitive.Select.Value;

export function SelectContent({
  children,
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Select.Popup> & { children?: ReactNode }) {
  return (
    <SelectPrimitive.Select.Portal>
      <SelectPrimitive.Select.Positioner className="select__positioner">
        <SelectPrimitive.Select.Popup {...props} className={cn("select__content", className)}>
          <SelectPrimitive.Select.List>{children}</SelectPrimitive.Select.List>
        </SelectPrimitive.Select.Popup>
      </SelectPrimitive.Select.Positioner>
    </SelectPrimitive.Select.Portal>
  );
}

export function SelectGroup({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Select.Group>) {
  return <SelectPrimitive.Select.Group {...props} className={cn("select__group", className)} />;
}

export function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Select.Item>) {
  return (
    <SelectPrimitive.Select.Item {...props} className={cn("select__item", className)}>
      <SelectPrimitive.Select.ItemText>{children}</SelectPrimitive.Select.ItemText>
      <SelectPrimitive.Select.ItemIndicator className="select__item-indicator">
        <Check aria-hidden="true" focusable="false" />
      </SelectPrimitive.Select.ItemIndicator>
    </SelectPrimitive.Select.Item>
  );
}
