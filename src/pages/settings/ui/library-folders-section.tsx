import { useState } from "react";
import { FolderPlus, RefreshCw, X } from "lucide-react";
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
} from "@/entities/library";
import { SectionTitle } from "@/shared/ui/headings";
import { Button } from "@/shared/ui/shadcn/button";
import { Checkbox } from "@/shared/ui/shadcn/checkbox";
import { Field, FieldLabel } from "@/shared/ui/shadcn/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/shared/ui/shadcn/item";
import { Spinner } from "@/shared/ui/shadcn/spinner";
import { EmptyStatus, ErrorAlert, LoadingStatus } from "@/shared/ui/workspace-status";
import { RemoveLibraryRootDialog } from "./remove-library-root-dialog";
import { ScanResult, ScanRunning, scanLabel } from "./scan-status";

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
              {/* Counts change constantly; the live region announces state changes only. */}
              {scanProgress ? (
                <span aria-hidden="true" className="ml-3">
                  {scanProgress}
                </span>
              ) : null}
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

      {scan?.state === "running" ? <ScanRunning scan={scan} /> : null}

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
                    <span className="ml-3">
                      {root.lastSuccessfulScanAtMs !== null ? "Scanned" : "Not scanned"}
                    </span>
                  </ItemDescription>
                  {rowError ? (
                    <p className="mt-1 text-sm text-destructive" role="alert">
                      {libraryCommandErrorMessage(rowError)}
                    </p>
                  ) : null}
                </ItemContent>
                <ItemActions className="w-full justify-end gap-3 sm:w-auto">
                  <Field orientation="horizontal" className="gap-2 text-sm text-muted-foreground">
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
                      Include <span className="sr-only">{root.path} </span>in library
                    </FieldLabel>
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
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

      {scan ? <ScanResult scan={scan} /> : null}

      <RemoveLibraryRootDialog
        root={removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        onConfirm={confirmRemove}
      />
    </section>
  );
}
