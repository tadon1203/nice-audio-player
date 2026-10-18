<script lang="ts">
  import FolderPlus from "@lucide/svelte/icons/folder-plus";
  import { LibraryErrors } from "#lib/library/library-errors";
  import { QueryResult } from "#lib/library/query-result.svelte";
  import type { LibraryRoot } from "#lib/native";
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
  import RemoveLibraryRootDialog from "./remove-library-root-dialog.svelte";
  import ResetLibraryDialog from "./reset-library-dialog.svelte";
  import ScanControls from "./scan-controls.svelte";
  import ScanResult from "./scan-result.svelte";
  import ScanRunning from "./scan-running.svelte";

  const { actions, catalog, libraryRoots, notices, scan: scanWatcher } = AppServices.current();
  const rootsQuery = new QueryResult(() => catalog.rootsOptions());
  const scanTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

  let removeTarget = $state<LibraryRoot | null>(null);
  let resetOpen = $state(false);
  let deleteMissingOpen = $state(false);

  const roots = $derived(rootsQuery.data ?? []);
  const missingTotal = $derived(roots.reduce((n, r) => n + r.missingCount, 0));
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
        onclick={() => actions.run(() => libraryRoots.add(), "library")}
        disabled={scanRunning || busy}
      >
        <FolderPlus data-icon="inline-start" aria-hidden="true" />
        Add folder
      </Button>
    </div>
  </div>

  {#if failure !== null}
    <p class="mt-4 text-right text-sm text-destructive" role="alert">{failure}</p>
  {/if}

  {#if rootsQuery.isError}
    <ErrorAlert
      message={LibraryErrors.commandMessage(rootsQuery.error)}
      onRetry={() => actions.run(() => rootsQuery.refetch(), "library")}
    />
  {/if}

  <div class="mt-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <h3 id="library-folders-heading" class="text-base font-medium text-foreground">
        Library folders
      </h3>
      <p class="mt-1 text-sm leading-5 text-muted-foreground">
        Enable a folder to include its audio files in the catalog.
      </p>
    </div>
    <ScanControls rootCount={roots.length} />
  </div>

  {#if scan?.state === "running"}
    <ScanRunning {scan} />
  {/if}

  {#if rootsQuery.isPending && roots.length === 0}
    <LoadingStatus>Loading library folders…</LoadingStatus>
  {:else if rootsQuery.isError}
    <!-- The error alert above owns this region. -->
  {:else if roots.length === 0}
    <EmptyStatus>No library folders yet. Add a folder to start building your library.</EmptyStatus>
  {:else}
    <ItemGroup
      class="mt-5 gap-0 divide-y divide-border border-y border-border"
      aria-label="Library folders"
    >
      {#each roots as root (root.id)}
        <Item
          role="listitem"
          class="items-start gap-4 rounded-none border-0 px-0 py-4 sm:flex-nowrap sm:items-center"
        >
          <ItemContent>
            <ItemTitle title={root.path} class="font-normal text-foreground">
              {root.path}
            </ItemTitle>
            <ItemDescription class="mt-1 whitespace-normal">
              {root.enabled ? "Included in library" : "Excluded from library"}
              <span class="ml-3">
                {root.lastSuccessfulScanAtMs !== null
                  ? `Scanned ${scanTime.format(root.lastSuccessfulScanAtMs)}`
                  : "Not scanned"}
              </span>
              <span class="ml-3">
                {CountFormat.number(root.trackCount)}
                {root.trackCount === 1 ? "track" : "tracks"}
              </span>
              {#if root.missingCount > 0}
                <span class="ml-3">{CountFormat.number(root.missingCount)} missing</span>
              {/if}
            </ItemDescription>
          </ItemContent>
          <ItemActions class="w-full justify-end gap-3 sm:w-auto">
            <Field orientation="horizontal" class="gap-2 text-sm text-muted-foreground">
              <!-- Controlled by the stored value: a failed change leaves the box where it was. -->
              <Checkbox
                id={`enabled-${root.id}`}
                bind:checked={
                  () => root.enabled,
                  (checked) =>
                    actions.run(() => libraryRoots.setEnabled(root.id, checked), "library")
                }
                disabled={scanRunning || busy}
              />
              <span class="text-muted-foreground max-sm:sr-only"
                ><FieldLabel for={`enabled-${root.id}`}>
                  Include <span class="sr-only">{root.path} </span>in library
                </FieldLabel></span
              >
            </Field>
            <Button
              type="button"
              variant="destructive"
              size="compact"
              aria-label={`Remove ${root.path} from library`}
              disabled={scanRunning || busy}
              onclick={() => (removeTarget = root)}
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
          onclick={() => actions.run(() => libraryRoots.openLogDirectory(), "library")}
        >
          Open log folder
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
    onConfirm={() => actions.run(() => libraryRoots.resetAndRescan(), "library")}
  />

  <DeleteMissingDialog
    open={deleteMissingOpen}
    count={missingTotal}
    onOpenChange={(open) => (deleteMissingOpen = open)}
    onConfirm={() => actions.run(() => libraryRoots.deleteMissing(), "library")}
  />

  <RemoveLibraryRootDialog
    root={removeTarget}
    onOpenChange={(open) => {
      if (!open) removeTarget = null;
    }}
    onConfirm={(root) => actions.run(() => libraryRoots.remove(root.id), "library")}
  />
</section>
