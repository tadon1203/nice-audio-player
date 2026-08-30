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
      className={cn(
        "group/field grid min-w-0 gap-2 data-[orientation=horizontal]:flex data-[orientation=horizontal]:items-center",
        className,
      )}
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
      className={cn(
        "text-text-primary group-data-[orientation=horizontal]/field:inline-flex group-data-[orientation=horizontal]/field:min-h-10 group-data-[orientation=horizontal]/field:items-center group-data-[orientation=horizontal]/field:gap-2",
        className,
      )}
    />
  );
}
export const FieldDescription = FieldPrimitive.Field.Description;
export const FieldError = FieldPrimitive.Field.Error;
export function FieldContent({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div {...props} data-slot="field-content" className={cn("min-w-0", className)}>
      {children}
    </div>
  );
}
export function FieldGroup({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div {...props} data-slot="field-group" className={cn("grid gap-2", className)}>
      {children}
    </div>
  );
}
