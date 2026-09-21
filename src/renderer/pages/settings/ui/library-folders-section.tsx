import { useState } from "react";
import { AlertCircle, Check, FolderPlus, RefreshCw, X } from "lucide-react";
import {
  libraryCommandErrorMessage,
  useAddLibraryRoot,
  useCancelLibraryScan,
  useLibraryRootsQuery,
  useLibraryScan,
  useRemoveLibraryRoot,
  useSetLibraryRootEnabled,
  useStartLibraryScan,
  type LibraryRoot,
} from "@/renderer/entities/library";
import { Alert, AlertDescription } from "@/renderer/shared/ui/shadcn/alert";
import { Button } from "@/renderer/shared/ui/shadcn/button";
import { Checkbox } from "@/renderer/shared/ui/shadcn/checkbox";
import { Field, FieldLabel } from "@/renderer/shared/ui/shadcn/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/renderer/shared/ui/shadcn/item";
import { Progress } from "@/renderer/shared/ui/shadcn/progress";
import { Spinner } from "@/renderer/shared/ui/shadcn/spinner";
import { RemoveLibraryRootDialog } from "./remove-library-root-dialog";

function formatCount(value: number | null, noun: string): string {
  return value === null ? `— ${noun}` : `${value.toLocaleString()} ${noun}`;
}

function scanLabel(state: string | undefined): string {
  switch (state) {
    case "running":
      return "Scanning";
    case "completed":
      return "Scan complete";
    case "cancelled":
      return "Scan cancelled";
    case "failed":
      return "Scan failed";
    default:
      return "Ready to scan";
  }
}

export function LibraryFoldersSection() {
  const rootsQuery = useLibraryRootsQuery();
  const scanQuery = useLibraryScan();
  const addRoot = useAddLibraryRoot();
  const setEnabled = useSetLibraryRootEnabled();
  const removeRoot = useRemoveLibraryRoot();
  const startScan = useStartLibraryScan();
  const cancelScan = useCancelLibraryScan();
  const [removeTarget, setRemoveTarget] = useState<LibraryRoot | null>(null);
  const roots = rootsQuery.data ?? [];
  const scan = scanQuery.data;
  const scanRunning = scan?.state === "running";
  const error = [
    rootsQuery.error,
    scanQuery.error,
    addRoot.error,
    setEnabled.error,
    removeRoot.error,
    startScan.error,
    cancelScan.error,
  ].find(Boolean);
  const scanProgress =
    scan && scan.inspectedCount !== null
      ? `${scan.inspectedCount.toLocaleString()} inspected`
      : null;

  const confirmRemove = () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    removeRoot.mutate(target.id);
  };

  return (
    <section aria-labelledby="library-heading" className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h2 id="library-heading" className="text-lg font-medium text-foreground">
            Library
          </h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Choose where your music lives.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => addRoot.mutate()}
          disabled={scanRunning || addRoot.isPending}
        >
          {addRoot.isPending ? (
            <Spinner className="size-4" />
          ) : (
            <FolderPlus className="size-4" aria-hidden="true" />
          )}
          Add folder
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-5" role="alert">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{libraryCommandErrorMessage(error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 id="library-folders-heading" className="text-base font-medium text-foreground">
            Library folders
          </h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Enable a folder to include its audio files in the catalog.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {scanLabel(scan?.state)}
            {scanProgress ? ` · ${scanProgress}` : ""}
          </span>
          {scanRunning ? (
            <Button type="button" variant="outline" onClick={() => cancelScan.mutate()}>
              <X className="size-4" aria-hidden="true" />
              Cancel scan
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => startScan.mutate()}
              disabled={scanQuery.isPending || roots.length === 0 || startScan.isPending}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Rescan
            </Button>
          )}
        </div>
      </div>

      {scanRunning ? (
        <div
          className="mt-4 rounded-md border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
          aria-label="Scan progress"
        >
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span>{formatCount(scan.discoveredCount, "discovered")}</span>
            <span>{formatCount(scan.inspectedCount, "inspected")}</span>
            <span>{formatCount(scan.indexedCount, "indexed")}</span>
            <span>{formatCount(scan.failedCount, "failed")}</span>
          </div>
          <Progress
            className="mt-3"
            value={scan.inspectedCount === 0 ? 0 : null}
            aria-label="Scan progress"
          />
          {scan.currentRoot ? (
            <p className="mt-2 truncate text-sm">Current folder: {scan.currentRoot.path}</p>
          ) : null}
        </div>
      ) : null}

      {rootsQuery.isPending && roots.length === 0 ? (
        <div
          className="mt-5 flex items-center gap-2 border-y border-border py-6 text-sm text-muted-foreground"
          role="status"
        >
          <Spinner className="size-4" />
          Loading library folders…
        </div>
      ) : rootsQuery.isError ? null : roots.length === 0 ? (
        <div className="mt-5 border-y border-border py-8 text-sm text-muted-foreground" role="status">
          No library folders yet. Add a folder to start building your library.
        </div>
      ) : (
        <ItemGroup
          className="mt-5 gap-0 divide-y divide-border border-y border-border"
          aria-label="Library folders"
        >
          {roots.map((root) => {
            const pending =
              (setEnabled.isPending && setEnabled.variables?.id === root.id) ||
              (removeRoot.isPending && removeRoot.variables === root.id);
            return (
              <Item
                key={root.id}
                role="listitem"
                className="items-start gap-4 rounded-none border-0 px-0 py-4 sm:flex-nowrap sm:items-center"
              >
                <ItemContent>
                  <ItemTitle title={root.path} className="font-normal text-foreground">
                    {root.path}
                  </ItemTitle>
                  <ItemDescription className="mt-1 whitespace-normal">
                    {root.enabled ? "Included in library" : "Excluded from library"}
                    {root.lastSuccessfulScanAtMs !== null ? " · Scanned" : " · Not scanned"}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="w-full justify-end gap-3 sm:w-auto">
                  <Field className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      id={`enabled-${root.id}`}
                      checked={root.enabled}
                      disabled={scanRunning || pending}
                      onCheckedChange={(checked) =>
                        setEnabled.mutate({ id: root.id, enabled: checked === true })
                      }
                    />
                    <FieldLabel
                      htmlFor={`enabled-${root.id}`}
                      className="font-normal text-muted-foreground max-sm:sr-only"
                    >
                      Enabled
                    </FieldLabel>
                  </Field>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={scanRunning || pending}
                    onClick={() => setRemoveTarget(root)}
                  >
                    Remove
                  </Button>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}

      {scan?.state === "failed" ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          Scan failed.
        </p>
      ) : null}
      {scan?.state === "cancelled" ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Scan cancelled.
        </p>
      ) : null}
      {scan?.state === "completed" ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Check className="size-4" aria-hidden="true" />
          Scan complete: {formatCount(scan.discoveredCount, "discovered")},{" "}
          {formatCount(scan.inspectedCount, "inspected")},{" "}
          {formatCount(scan.indexedCount, "indexed")},{" "}
          {formatCount(scan.failedCount, "failed")}.
        </p>
      ) : null}

      <RemoveLibraryRootDialog
        root={removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        onConfirm={confirmRemove}
      />
    </section>
  );
}
