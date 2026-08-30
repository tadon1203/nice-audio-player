import { useMemo, useRef } from "react";
import type { LibraryRoot, LibraryScanSnapshot } from "@/bindings";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger,
  createAlertDialogHandle,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { typographyVariants } from "@/components/ui/typography";

interface LibraryFoldersSettingsProps {
  roots: LibraryRoot[];
  busy: boolean;
  error: string | null;
  scanning: boolean;
  scan: LibraryScanSnapshot | null;
  addFolder(): Promise<void>;
  removeRoot(root: LibraryRoot): Promise<boolean>;
  runScanAction(): Promise<void>;
  toggleRoot(root: LibraryRoot): Promise<void>;
}
export function LibraryFoldersSettings({
  roots,
  busy,
  error,
  scanning,
  scan,
  addFolder,
  removeRoot,
  runScanAction,
  toggleRoot,
}: LibraryFoldersSettingsProps) {
  const addFolderRef = useRef<HTMLButtonElement>(null);
  const removeTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogActionsRef = useRef<{ close: () => void; unmount: () => void }>(null);
  const dialogHandle = useMemo(() => createAlertDialogHandle<LibraryRoot>(), []);
  return (
    <section className="mt-12">
      <div className="flex flex-col items-start justify-between gap-6 app-wide:flex-row app-wide:items-end">
        <div>
          <h2 className={typographyVariants({ role: "section-title" })}>Library folders</h2>
          <p>Choose locations to include in your music library.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" disabled={busy} onClick={() => void runScanAction()}>
            {scanning ? "Cancel scan" : "Rescan library"}
          </Button>
          <Button
            ref={addFolderRef}
            type="button"
            variant="filled"
            disabled={busy || scanning}
            onClick={() => void addFolder()}
          >
            Add folder
          </Button>
        </div>
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="mt-4 overflow-hidden rounded-surface border border-border-subtle">
        {roots.map((root) => (
          <div
            className="flex min-h-[68px] flex-col items-start justify-between gap-4 border-b border-border-subtle px-4 py-3 last:border-0 app-wide:flex-row app-wide:items-center"
            key={root.id}
          >
            <span className="min-w-0">
              <strong className="block overflow-hidden text-ellipsis whitespace-nowrap">
                {root.path}
              </strong>
              <small className="block overflow-hidden text-ellipsis whitespace-nowrap text-text-secondary">
                {root.enabled ? "Included in scans" : "Excluded from scans"}
              </small>
            </span>
            <div className="flex flex-none flex-wrap items-center gap-2 app-wide:flex-nowrap">
              <Field orientation="horizontal">
                <FieldLabel>
                  <Checkbox
                    checked={root.enabled}
                    disabled={busy || scanning}
                    onCheckedChange={() => void toggleRoot(root)}
                  />
                  <span>Include</span>
                </FieldLabel>
              </Field>
              <AlertDialogTrigger
                handle={dialogHandle}
                payload={root}
                render={
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy || scanning}
                    ref={removeTriggerRef}
                  />
                }
                onClick={() => {
                  removeTriggerRef.current = document.activeElement as HTMLButtonElement;
                }}
              >
                Remove
              </AlertDialogTrigger>
            </div>
          </div>
        ))}
        {roots.length === 0 ? (
          <p className="min-h-[68px] px-4 py-3 text-text-secondary">No library folders added.</p>
        ) : null}
      </div>
      {scan ? (
        <p className="mt-3 text-text-secondary">
          {scanning
            ? `Scanning: ${scan.indexedCount} tracks indexed`
            : scan.state === "completed"
              ? "Library scan is up to date."
              : scan.state === "cancelled"
                ? "Library scan was cancelled."
                : scan.state === "failed"
                  ? "The last library scan did not complete."
                  : null}
        </p>
      ) : null}
      <AlertDialog handle={dialogHandle} actionsRef={dialogActionsRef}>
        {({ payload: root }) => (
          <AlertDialogContent
            finalFocus={() =>
              removeTriggerRef.current?.isConnected
                ? removeTriggerRef.current
                : addFolderRef.current
            }
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Remove library folder?</AlertDialogTitle>
              <p>{root?.path}</p>
              <AlertDialogDescription>
                This removes index entries but does not delete music files.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error ? <Alert variant="error">{error}</Alert> : null}
            <AlertDialogFooter>
              <AlertDialogCancel render={<Button type="button" disabled={busy} />}>
                Cancel
              </AlertDialogCancel>
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  if (root && (await removeRoot(root))) dialogActionsRef.current?.close();
                }}
              >
                Remove
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </section>
  );
}
