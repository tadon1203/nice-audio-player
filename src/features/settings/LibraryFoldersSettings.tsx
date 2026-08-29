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
    <section className="settings-view__section">
      <div className="settings-view__section-head">
        <div>
          <h2 className="type-section-title">Library folders</h2>
          <p>Choose locations to include in your music library.</p>
        </div>
        <div>
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
      {error ? <Alert className="inline-notice--error">{error}</Alert> : null}
      <div className="settings-view__roots">
        {roots.map((root) => (
          <div key={root.id}>
            <span>
              <strong>{root.path}</strong>
              <small>{root.enabled ? "Included in scans" : "Excluded from scans"}</small>
            </span>
            <div className="settings-view__root-actions">
              <Field orientation="horizontal" className="settings-view__root-toggle">
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
          <p className="settings-view__roots-empty">No library folders added.</p>
        ) : null}
      </div>
      {scan ? (
        <p className="settings-view__scan">
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
            {error ? <Alert className="inline-notice--error">{error}</Alert> : null}
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
