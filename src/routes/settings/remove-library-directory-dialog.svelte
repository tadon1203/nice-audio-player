<script lang="ts">
  import { type LibraryDirectory } from "#lib/native/bindings";
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from "#lib/components/ui/shadcn/alert-dialog/index.js";

  let {
    directory,
    onOpenChange,
    onConfirm,
  }: {
    directory: LibraryDirectory | null;
    onOpenChange: (open: boolean) => void;
    onConfirm: (directory: LibraryDirectory) => void;
  } = $props();
</script>

<AlertDialog open={directory !== null} {onOpenChange}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Remove library directory?</AlertDialogTitle>
      <AlertDialogDescription>
        {directory?.path}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <p class="text-sm leading-5 text-muted-foreground">
      This removes indexed library records for this directory. It does not delete audio files.
    </p>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        variant="destructive"
        onclick={() => directory !== null && onConfirm(directory)}>Remove</AlertDialogAction
      >
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
