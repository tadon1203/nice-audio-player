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
  import { formatNumber } from "$lib/utils/format";

  let {
    open,
    count,
    onOpenChange,
    onConfirm,
  }: {
    open: boolean;
    count: number;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
  } = $props();
</script>

<AlertDialog {open} {onOpenChange}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>
        Delete {formatNumber(count)} Missing {count === 1 ? "track" : "tracks"}?
      </AlertDialogTitle>
      <AlertDialogDescription>
        These tracks' files are gone from your folders.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <p class="text-sm leading-5 text-muted-foreground">
      This removes them from the library. It does not delete or change any audio file.
    </p>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction purpose="destructive" onclick={onConfirm}>Delete Missing</AlertDialogAction
      >
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
