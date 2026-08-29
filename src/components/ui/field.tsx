import * as FieldPrimitive from "@base-ui/react/field";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({
  className,
  orientation = "vertical",
  children,
  ...props
}: ComponentProps<typeof FieldPrimitive.Field.Root> & {
  orientation?: "vertical" | "horizontal";
  children?: ReactNode;
}) {
  return (
    <FieldPrimitive.Field.Root
      {...props}
      data-slot="field"
      data-orientation={orientation}
      className={cn("field", className)}
    >
      {children}
    </FieldPrimitive.Field.Root>
  );
}
export function FieldLabel({
  className,
  ...props
}: ComponentProps<typeof FieldPrimitive.Field.Label>) {
  return (
    <FieldPrimitive.Field.Label
      {...props}
      data-slot="field-label"
      className={cn("field__label", className)}
    />
  );
}
export const FieldDescription = FieldPrimitive.Field.Description;
export const FieldError = FieldPrimitive.Field.Error;
export function FieldContent({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div {...props} data-slot="field-content" className={cn("field__content", className)}>
      {children}
    </div>
  );
}
export function FieldGroup({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div {...props} data-slot="field-group" className={cn("field-group", className)}>
      {children}
    </div>
  );
}
