<script lang="ts">
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
    open,
    onOpenChange,
    onConfirm,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
  } = $props();
</script>

<AlertDialog {open} {onOpenChange}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Reset library and rescan?</AlertDialogTitle>
      <AlertDialogDescription class="sr-only">
        Moves the library database to a backup file and restarts the app.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <p class="text-sm leading-5 text-muted-foreground">
      The library database is moved to a backup file and recreated, then the app restarts and
      rescans your folders. Your audio files and settings are not touched; only the library index is
      rebuilt.
    </p>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction variant="destructive" onclick={onConfirm}>Reset and restart</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
