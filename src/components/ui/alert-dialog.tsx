import * as AlertDialogPrimitive from "@base-ui/react/alert-dialog";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const AlertDialog = AlertDialogPrimitive.AlertDialog.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.AlertDialog.Trigger;
export function AlertDialogContent({
  children,
  ...props
}: { children: ReactNode; className?: string } & ComponentProps<
  typeof AlertDialogPrimitive.AlertDialog.Popup
>) {
  return (
    <AlertDialogPrimitive.AlertDialog.Portal>
      <AlertDialogPrimitive.AlertDialog.Backdrop className="absolute inset-0 pointer-events-auto" />
      <AlertDialogPrimitive.AlertDialog.Viewport>
        <AlertDialogPrimitive.AlertDialog.Popup
          {...props}
          className="w-[min(100%,32rem)] rounded-surface border border-border-subtle bg-surface-raised p-6 forced-colors:border-CanvasText"
        >
          {children}
        </AlertDialogPrimitive.AlertDialog.Popup>
      </AlertDialogPrimitive.AlertDialog.Viewport>
    </AlertDialogPrimitive.AlertDialog.Portal>
  );
}
export function AlertDialogTitle(
  props: ComponentProps<typeof AlertDialogPrimitive.AlertDialog.Title>,
) {
  return (
    <AlertDialogPrimitive.AlertDialog.Title
      {...props}
      className="mb-3 text-section-title font-semibold leading-section-title text-text-primary"
    />
  );
}
export function AlertDialogDescription(
  props: ComponentProps<typeof AlertDialogPrimitive.AlertDialog.Description>,
) {
  return (
    <AlertDialogPrimitive.AlertDialog.Description
      {...props}
      className="my-2 overflow-wrap-anywhere text-text-secondary"
    />
  );
}
export const AlertDialogAction = AlertDialogPrimitive.AlertDialog.Close;
export const AlertDialogCancel = AlertDialogPrimitive.AlertDialog.Close;
export const AlertDialogHandle = AlertDialogPrimitive.AlertDialog.Handle;
export const createAlertDialogHandle = AlertDialogPrimitive.AlertDialog.createHandle;
export function AlertDialogHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("grid gap-1", className)}>{children}</div>;
}
export function AlertDialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("mt-5 flex justify-end gap-2", className)}>{children}</div>;
}
