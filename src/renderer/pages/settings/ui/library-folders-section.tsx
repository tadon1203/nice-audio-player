import { useState } from "react";
import { Check, FolderPlus, RefreshCw, X } from "lucide-react";
import {
  libraryCommandErrorMessage,
  libraryScanFailureMessage,
  useAddLibraryRoot,
  useCancelLibraryScan,
  useLibraryRootsQuery,
  useLibraryScan,
  useRemoveLibraryRoot,
  useSetLibraryRootEnabled,
  useStartLibraryScan,
  type LibraryRoot,
  type LibraryScanState,
} from "@/renderer/entities/library";
import { formatNumber } from "@/renderer/shared/lib/format";
import { SectionTitle } from "@/renderer/shared/ui/headings";
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
import { EmptyStatus, ErrorAlert, LoadingStatus } from "@/renderer/shared/ui/workspace-status";
import { RemoveLibraryRootDialog } from "./remove-library-root-dialog";

function formatProgress(value: number | null, label: string): string {
  return `${formatNumber(value)} ${label}`;
}

function scanLabel(state: LibraryScanState | undefined): string {
  switch (state) {
    case "running":
      return "Scanning";
    case "completed":
      return "Scan complete";
    case "cancelled":
      return "Scan cancelled";
    case "failed":
      return "Scan failed";
    case "idle":
    case undefined:
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
  const scanProgress =
    scan && scan.inspectedCount !== null
      ? `${scan.inspectedCount.toLocaleString()} inspected`
      : null;
  const scanControlError = startScan.error ?? cancelScan.error ?? scanQuery.error;

  const confirmRemove = () => {
    if (!removeTarget) return;
    const target = removeTarget;
    removeRoot.reset();
    setRemoveTarget(null);
    removeRoot.mutate(target.id);
  };

  return (
    <section aria-labelledby="library-heading" className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <SectionTitle id="library-heading">Library</SectionTitle>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Choose where your music lives.
          </p>
        </div>
        <div className="flex max-w-sm flex-col items-end gap-2">
          <Button
            type="button"
            onClick={() => {
              addRoot.reset();
              addRoot.mutate();
            }}
            disabled={scanRunning || addRoot.isPending}
          >
            {addRoot.isPending ? (
              <Spinner data-icon="inline-start" aria-hidden="true" role="presentation" />
            ) : (
              <FolderPlus data-icon="inline-start" aria-hidden="true" />
            )}
            Add folder
          </Button>
          {addRoot.error ? (
            <p className="text-right text-sm text-destructive" role="alert">
              {libraryCommandErrorMessage(addRoot.error)}
            </p>
          ) : null}
        </div>
      </div>

      {rootsQuery.isError ? (
        <ErrorAlert
          message={libraryCommandErrorMessage(rootsQuery.error)}
          onRetry={() => void rootsQuery.refetch()}
        />
      ) : null}

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 id="library-folders-heading" className="text-base font-medium text-foreground">
            Library folders
          </h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Enable a folder to include its audio files in the catalog.
          </p>
        </div>
        <div className="flex max-w-sm flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {scanLabel(scan?.state)}
              {scanProgress ? ` · ${scanProgress}` : ""}
            </span>
            {scanRunning ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  cancelScan.reset();
                  cancelScan.mutate();
                }}
                disabled={cancelScan.isPending}
              >
                <X data-icon="inline-start" aria-hidden="true" />
                Cancel scan
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  startScan.reset();
                  startScan.mutate();
                }}
                disabled={scanQuery.isPending || roots.length === 0 || startScan.isPending}
              >
                <RefreshCw data-icon="inline-start" aria-hidden="true" />
                Rescan
              </Button>
            )}
          </div>
          {scanControlError ? (
            <p className="text-right text-sm text-destructive" role="alert">
              {libraryCommandErrorMessage(scanControlError)}
            </p>
          ) : null}
        </div>
      </div>

      {scanRunning ? (
        <div className="mt-4 rounded-md border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span>{formatProgress(scan.discoveredCount, "discovered")}</span>
            <span>{formatProgress(scan.inspectedCount, "inspected")}</span>
            <span>{formatProgress(scan.indexedCount, "indexed")}</span>
            <span>{formatProgress(scan.failedCount, "failed")}</span>
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
        <LoadingStatus>Loading library folders…</LoadingStatus>
      ) : rootsQuery.isError ? null : roots.length === 0 ? (
        <EmptyStatus>
          No library folders yet. Add a folder to start building your library.
        </EmptyStatus>
      ) : (
        <ItemGroup
          className="mt-5 gap-0 divide-y divide-border border-y border-border"
          aria-label="Library folders"
        >
          {roots.map((root) => {
            const pending =
              (setEnabled.isPending && setEnabled.variables?.id === root.id) ||
              (removeRoot.isPending && removeRoot.variables === root.id);
            const rowError =
              setEnabled.error && setEnabled.variables?.id === root.id
                ? setEnabled.error
                : removeRoot.error && removeRoot.variables === root.id
                  ? removeRoot.error
                  : null;
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
                  {rowError ? (
                    <p className="mt-1 text-sm text-destructive" role="alert">
                      {libraryCommandErrorMessage(rowError)}
                    </p>
                  ) : null}
                </ItemContent>
                <ItemActions className="w-full justify-end gap-3 sm:w-auto">
                  <Field className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Checkbox
                      id={`enabled-${root.id}`}
                      checked={root.enabled}
                      disabled={scanRunning || pending}
                      onCheckedChange={(checked) => {
                        setEnabled.reset();
                        setEnabled.mutate({ id: root.id, enabled: checked === true });
                      }}
                    />
                    <FieldLabel
                      htmlFor={`enabled-${root.id}`}
                      className="font-normal text-muted-foreground max-sm:sr-only"
                    >
                      Include<span className="sr-only"> {root.path}</span> in library
                    </FieldLabel>
                  </Field>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    aria-label={`Remove ${root.path} from library`}
                    disabled={scanRunning || pending}
                    onClick={() => {
                      removeRoot.reset();
                      setRemoveTarget(root);
                    }}
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
          {libraryScanFailureMessage(scan.failureCode)}
        </p>
      ) : null}
      {scan?.state === "completed" ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4" aria-hidden="true" />
          {formatProgress(scan.discoveredCount, "discovered")},{" "}
          {formatProgress(scan.inspectedCount, "inspected")},{" "}
          {formatProgress(scan.indexedCount, "indexed")},{" "}
          {formatProgress(scan.failedCount, "failed")}.
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
