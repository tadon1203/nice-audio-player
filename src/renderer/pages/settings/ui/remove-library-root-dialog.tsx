import type { LibraryRoot } from "@/renderer/entities/library";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/renderer/shared/ui/shadcn/alert-dialog";

export function RemoveLibraryRootDialog({
  root,
  onOpenChange,
  onConfirm,
}: {
  root: LibraryRoot | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={root !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove library folder?</AlertDialogTitle>
          <AlertDialogDescription className="break-words text-foreground">
            {root?.path}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm leading-5 text-muted-foreground">
          This removes indexed library records for this folder. It does not delete audio files.
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
