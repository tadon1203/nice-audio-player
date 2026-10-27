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
  } from "#lib/components/ui/shadcn/alert-dialog/index.js";

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
        Deletes the library database and its artwork, then restarts the app.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <p class="text-sm leading-5 text-muted-foreground">
      The library database and its artwork are deleted and recreated, then the app restarts and
      rescans your directories. Your audio files and settings are not touched; only the library
      index is rebuilt.
    </p>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction variant="destructive" onclick={onConfirm}
        >Reset and restart</AlertDialogAction
      >
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
