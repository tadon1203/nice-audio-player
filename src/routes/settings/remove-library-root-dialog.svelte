<script lang="ts">
  import type { LibraryRoot } from "$lib/native";
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from "$lib/ui/shadcn/alert-dialog/index.js";

  let {
    root,
    onOpenChange,
    onConfirm,
  }: {
    root: LibraryRoot | null;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
  } = $props();
</script>

<AlertDialog open={root !== null} {onOpenChange}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Remove library folder?</AlertDialogTitle>
      <AlertDialogDescription>
        {root?.path}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <p class="text-sm leading-5 text-muted-foreground">
      This removes indexed library records for this folder. It does not delete audio files.
    </p>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction purpose="destructive" onclick={onConfirm}>Remove</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
