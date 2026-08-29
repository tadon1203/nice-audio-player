import * as AlertDialogPrimitive from "@base-ui/react/alert-dialog";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const AlertDialog = AlertDialogPrimitive.AlertDialog.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.AlertDialog.Trigger;
export function AlertDialogContent({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & ComponentProps<
  typeof AlertDialogPrimitive.AlertDialog.Popup
>) {
  return (
    <AlertDialogPrimitive.AlertDialog.Portal>
      <AlertDialogPrimitive.AlertDialog.Backdrop className="dialog-backdrop" />
      <AlertDialogPrimitive.AlertDialog.Viewport>
        <AlertDialogPrimitive.AlertDialog.Popup {...props} className={cn("dialog", className)}>
          {children}
        </AlertDialogPrimitive.AlertDialog.Popup>
      </AlertDialogPrimitive.AlertDialog.Viewport>
    </AlertDialogPrimitive.AlertDialog.Portal>
  );
}
export const AlertDialogTitle = AlertDialogPrimitive.AlertDialog.Title;
export const AlertDialogDescription = AlertDialogPrimitive.AlertDialog.Description;
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
  return <div className={cn("dialog__header", className)}>{children}</div>;
}
export function AlertDialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("dialog__actions", className)}>{children}</div>;
}
