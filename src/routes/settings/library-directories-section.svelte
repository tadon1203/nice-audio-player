<script lang="ts">
  import FolderPlus from "@lucide/svelte/icons/folder-plus";
  import { errorMessage } from "#lib/native/messages";
  import { QueryResult } from "#lib/library/query-result.svelte";
  import { type LibraryDirectory } from "#lib/native/bindings";
  import { AppServices } from "#lib/shell/app-services.svelte";
  import EmptyStatus from "#lib/ui/empty-status.svelte";
  import ErrorAlert from "#lib/ui/error-alert.svelte";
  import LoadingStatus from "#lib/ui/loading-status.svelte";
  import SectionTitle from "#lib/ui/section-title.svelte";
  import { Button } from "#lib/ui/shadcn/button/index.js";
  import { Checkbox } from "#lib/ui/shadcn/checkbox/index.js";
  import { Field, FieldLabel } from "#lib/ui/shadcn/field/index.js";
  import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemTitle,
  } from "#lib/ui/shadcn/item/index.js";
  import { CountFormat } from "#lib/utils/count-format";
  import DeleteMissingDialog from "./delete-missing-dialog.svelte";
  import RemoveLibraryDirectoryDialog from "./remove-library-directory-dialog.svelte";
  import ResetLibraryDialog from "./reset-library-dialog.svelte";
  import ScanControls from "./scan-controls.svelte";
  import ScanResult from "./scan-result.svelte";
  import ScanRunning from "./scan-running.svelte";

  const {
    actions,
    catalog,
    libraryDirectories,
    notices,
    scan: scanWatcher,
  } = AppServices.current();
  const directoriesQuery = new QueryResult(() => catalog.directoriesOptions());
  const scanTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

  let removeTarget = $state<LibraryDirectory | null>(null);
  let resetOpen = $state(false);
  let deleteMissingOpen = $state(false);

  const directories = $derived(directoriesQuery.data ?? []);
  const missingTotal = $derived(directories.reduce((n, r) => n + r.missingCount, 0));
  const scan = $derived(scanWatcher.snapshot);
  const scanRunning = $derived(scan?.state === "running");
  /** A Library command is in flight: its controls wait for it, so one request is sent at a time. */
  const busy = $derived(actions.isRunning("library"));
  /** The last failed Library command, shown once for the whole section. */
  const failure = $derived(notices.at("library")?.message ?? null);
</script>

<section aria-labelledby="library-heading" class="mt-8">
  <div class="flex flex-wrap items-start justify-between gap-5">
    <div>
      <SectionTitle id="library-heading">Library</SectionTitle>
      <p class="mt-1 text-sm leading-5 text-muted-foreground">Choose where your music lives.</p>
    </div>
    <div class="flex max-w-sm flex-col items-end gap-2">
      <Button
        type="button"
        onclick={() => actions.run(() => libraryDirectories.add(), "library")}
        disabled={scanRunning || busy}
      >
        <FolderPlus data-icon="inline-start" aria-hidden="true" />
        Add directory
      </Button>
    </div>
  </div>

  {#if failure !== null}
    <p class="mt-4 text-right text-sm text-destructive" role="alert">{failure}</p>
  {/if}

  {#if directoriesQuery.isError}
    <ErrorAlert
      message={errorMessage(directoriesQuery.error)}
      onRetry={() => actions.run(() => directoriesQuery.refetch(), "library")}
    />
  {/if}

  <div class="mt-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h3 id="library-directories-heading" class="text-base font-medium text-foreground">
        Library directories
      </h3>
      <p class="mt-1 text-sm leading-5 text-muted-foreground">
        Enable a directory to include its audio files in the catalog.
      </p>
    </div>
    <ScanControls directoryCount={directories.length} />
  </div>

  {#if scan?.state === "running"}
    <ScanRunning {scan} />
  {/if}

  {#if directoriesQuery.isPending && directories.length === 0}
    <LoadingStatus>Loading library directories…</LoadingStatus>
  {:else if directoriesQuery.isError}
    <!-- The error alert above owns this region. -->
  {:else if directories.length === 0}
    <EmptyStatus
      >No library directories yet. Add a directory to start building your library.</EmptyStatus
    >
  {:else}
    <ItemGroup
      class="mt-5 gap-0 divide-y divide-border border-y border-border"
      aria-label="Library directories"
    >
      {#each directories as directory (directory.id)}
        <Item
          role="listitem"
          class="items-start gap-4 rounded-none border-0 px-0 py-4 sm:flex-nowrap sm:items-center"
        >
          <ItemContent>
            <ItemTitle title={directory.path} class="font-normal text-foreground">
              {directory.path}
            </ItemTitle>
            <ItemDescription class="mt-1 whitespace-normal">
              {directory.enabled ? "Included in library" : "Excluded from library"}
              <span class="ml-3">
                {directory.lastSuccessfulScanAtMs !== null
                  ? `Scanned ${scanTime.format(directory.lastSuccessfulScanAtMs)}`
                  : "Not scanned"}
              </span>
              <span class="ml-3">
                {CountFormat.number(directory.trackCount)}
                {directory.trackCount === 1 ? "track" : "tracks"}
              </span>
              {#if directory.missingCount > 0}
                <span class="ml-3">{CountFormat.number(directory.missingCount)} missing</span>
              {/if}
            </ItemDescription>
          </ItemContent>
          <ItemActions class="w-full justify-end gap-3 sm:w-auto">
            <Field orientation="horizontal" class="gap-2 text-sm text-muted-foreground">
              <!-- Controlled by the stored value: a failed change leaves the box where it was. -->
              <Checkbox
                id={`enabled-${directory.id}`}
                bind:checked={
                  () => directory.enabled,
                  (checked) =>
                    actions.run(
                      () => libraryDirectories.setEnabled(directory.id, checked),
                      "library",
                    )
                }
                disabled={scanRunning || busy}
              />
              <span class="text-muted-foreground max-sm:sr-only"
                ><FieldLabel for={`enabled-${directory.id}`}>
                  Include <span class="sr-only">{directory.path} </span>in library
                </FieldLabel></span
              >
            </Field>
            <Button
              type="button"
              variant="destructive"
              size="compact"
              aria-label={`Remove ${directory.path} from library`}
              disabled={scanRunning || busy}
              onclick={() => (removeTarget = directory)}
            >
              Remove
            </Button>
          </ItemActions>
        </Item>
      {/each}
    </ItemGroup>
  {/if}

  {#if scan}
    <ScanResult {scan} />
  {/if}

  <div class="mt-8 flex flex-wrap items-start justify-between gap-4 border-t border-border pt-6">
    <p class="max-w-prose text-sm leading-5 text-muted-foreground">
      Missing tracks are kept until you delete them. Deleting never touches your audio files.
      <span class="ml-1 text-foreground">{CountFormat.number(missingTotal)} missing</span>
    </p>
    <div class="flex max-w-sm flex-col items-end gap-2">
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="compact"
          disabled={scanRunning || busy || missingTotal === 0}
          onclick={() => (deleteMissingOpen = true)}
        >
          Delete Missing
        </Button>
        <Button
          type="button"
          variant="outline"
          size="compact"
          disabled={busy}
          onclick={() => actions.run(() => libraryDirectories.appOpenLogDirectory(), "library")}
        >
          Open log directory
        </Button>
      </div>
    </div>
  </div>

  <div class="mt-6 flex flex-wrap items-start justify-between gap-4 border-t border-border pt-6">
    <p class="max-w-prose text-sm leading-5 text-muted-foreground">
      Use this if the library looks wrong or cannot be opened.
    </p>
    <div class="flex max-w-sm flex-col items-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="compact"
        disabled={scanRunning || busy}
        onclick={() => (resetOpen = true)}
      >
        Reset library and rescan
      </Button>
    </div>
  </div>

  <ResetLibraryDialog
    open={resetOpen}
    onOpenChange={(open) => (resetOpen = open)}
    onConfirm={() => actions.run(() => libraryDirectories.resetAndRescan(), "library")}
  />

  <DeleteMissingDialog
    open={deleteMissingOpen}
    count={missingTotal}
    onOpenChange={(open) => (deleteMissingOpen = open)}
    onConfirm={() => actions.run(() => libraryDirectories.deleteMissing(), "library")}
  />

  <RemoveLibraryDirectoryDialog
    directory={removeTarget}
    onOpenChange={(open) => {
      if (!open) removeTarget = null;
    }}
    onConfirm={(directory) => actions.run(() => libraryDirectories.remove(directory.id), "library")}
  />
</section>
