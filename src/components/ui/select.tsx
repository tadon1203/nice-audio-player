import * as SelectPrimitive from "@base-ui/react/select";
import type { ComponentProps, ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export const Select = SelectPrimitive.Select.Root;

export function SelectTrigger({
  children,
  ...props
}: Omit<ComponentProps<typeof SelectPrimitive.Select.Trigger>, "className">) {
  return (
    <SelectPrimitive.Select.Trigger
      {...props}
      className="flex min-h-10 w-full items-center justify-between gap-2 rounded-control border border-border-control bg-surface px-3 text-start text-text-primary data-[disabled]:cursor-not-allowed data-[disabled]:text-text-disabled"
    >
      {children}
      <SelectPrimitive.Select.Icon className="inline-flex">
        <ChevronDown className="h-4 w-4" aria-hidden="true" focusable="false" />
      </SelectPrimitive.Select.Icon>
    </SelectPrimitive.Select.Trigger>
  );
}

export const SelectValue = SelectPrimitive.Select.Value;

export function SelectContent({
  children,
  ...props
}: Omit<ComponentProps<typeof SelectPrimitive.Select.Popup>, "className"> & {
  children?: ReactNode;
}) {
  return (
    <SelectPrimitive.Select.Portal>
      <SelectPrimitive.Select.Positioner>
        <SelectPrimitive.Select.Popup
          {...props}
          className="z-[5] max-h-[min(360px,var(--available-height))] min-w-[var(--anchor-width)] overflow-y-auto rounded-surface border border-border-subtle bg-surface-raised p-1 text-text-primary"
        >
          <SelectPrimitive.Select.List>{children}</SelectPrimitive.Select.List>
        </SelectPrimitive.Select.Popup>
      </SelectPrimitive.Select.Positioner>
    </SelectPrimitive.Select.Portal>
  );
}

export function SelectGroup({ ...props }: ComponentProps<typeof SelectPrimitive.Select.Group>) {
  return <SelectPrimitive.Select.Group {...props} />;
}

export function SelectItem({
  children,
  ...props
}: Omit<ComponentProps<typeof SelectPrimitive.Select.Item>, "className">) {
  return (
    <SelectPrimitive.Select.Item
      {...props}
      className="flex min-h-10 items-center justify-between rounded-control px-3 data-[highlighted]:bg-surface-hover data-[disabled]:text-text-disabled"
    >
      <SelectPrimitive.Select.ItemText>{children}</SelectPrimitive.Select.ItemText>
      <SelectPrimitive.Select.ItemIndicator className="inline-flex">
        <Check className="h-4 w-4" aria-hidden="true" focusable="false" />
      </SelectPrimitive.Select.ItemIndicator>
    </SelectPrimitive.Select.Item>
  );
}
