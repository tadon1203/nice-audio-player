<script lang="ts">
  import FolderPlus from "@lucide/svelte/icons/folder-plus";
  import { createLibraryRoots, createLibraryScan } from "$lib/library/detail.svelte";
  import { libraryCommandErrorMessage } from "$lib/library/library-errors";
  import {
    createAddLibraryRoot,
    createDeleteMissingTracks,
    createOpenLogDirectory,
    createRemoveLibraryRoot,
    createResetLibrary,
    createSetLibraryRootEnabled,
  } from "$lib/library/mutations";
  import type { LibraryRoot } from "$lib/native";
  import EmptyStatus from "$lib/ui/empty-status.svelte";
  import ErrorAlert from "$lib/ui/error-alert.svelte";
  import LoadingStatus from "$lib/ui/loading-status.svelte";
  import SectionTitle from "$lib/ui/section-title.svelte";
  import { Button, LegacyButton as CompatButton } from "$lib/ui/shadcn/button/index.js";
  import { Checkbox } from "$lib/ui/shadcn/checkbox/index.js";
  import { Field, FieldLabel } from "$lib/ui/shadcn/field/index.js";
  import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemTitle,
  } from "$lib/ui/shadcn/item/index.js";
  import { Spinner } from "$lib/ui/shadcn/spinner/index.js";
  import { formatNumber } from "$lib/utils/format";
  import DeleteMissingDialog from "./delete-missing-dialog.svelte";
  import RemoveLibraryRootDialog from "./remove-library-root-dialog.svelte";
  import ResetLibraryDialog from "./reset-library-dialog.svelte";
  import ScanControls from "./scan-controls.svelte";
  import ScanResult from "./scan-result.svelte";
  import ScanRunning from "./scan-running.svelte";

  const rootsQuery = createLibraryRoots();
  const scanQuery = createLibraryScan();
  const addRoot = createAddLibraryRoot();
  const setEnabled = createSetLibraryRootEnabled();
  const removeRoot = createRemoveLibraryRoot();

  const resetLibrary = createResetLibrary();

  const deleteMissing = createDeleteMissingTracks();
  const openLogDirectory = createOpenLogDirectory();
  const scanTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

  let removeTarget = $state<LibraryRoot | null>(null);
  let resetOpen = $state(false);
  let deleteMissingOpen = $state(false);

  const roots = $derived(rootsQuery.data ?? []);
  const missingTotal = $derived(roots.reduce((n, r) => n + r.missingCount, 0));
  const scan = $derived(scanQuery.data);
  const scanRunning = $derived(scan?.state === "running");

  function confirmRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    removeRoot.reset();
    removeTarget = null;
    removeRoot.mutate(target.id);
  }

  function rowPending(id: string): boolean {
    return (
      (setEnabled.isPending && setEnabled.variables?.id === id) ||
      (removeRoot.isPending && removeRoot.variables === id)
    );
  }

  function rowError(id: string): unknown {
    if (setEnabled.error && setEnabled.variables?.id === id) return setEnabled.error;
    if (removeRoot.error && removeRoot.variables === id) return removeRoot.error;
    return null;
  }

  function setRootEnabled(id: string, enabled: boolean) {
    setEnabled.reset();
    setEnabled.mutate({ id, enabled });
  }
</script>

<section aria-labelledby="library-heading" class="mt-8">
  <div class="flex flex-wrap items-start justify-between gap-5">
    <div>
      <SectionTitle id="library-heading">Library</SectionTitle>
      <p class="mt-1 text-sm leading-5 text-muted-foreground">Choose where your music lives.</p>
    </div>
    <div class="flex max-w-sm flex-col items-end gap-2">
      <CompatButton
        type="button"
        onclick={() => {
          addRoot.reset();
          addRoot.mutate();
        }}
        disabled={scanRunning || addRoot.isPending}
      >
        {#if addRoot.isPending}
          <Spinner data-icon="inline-start" aria-hidden="true" role="presentation" />
        {:else}
          <FolderPlus data-icon="inline-start" aria-hidden="true" />
        {/if}
        Add folder
      </CompatButton>
      {#if addRoot.error}
        <p class="text-right text-sm text-destructive" role="alert">
          {libraryCommandErrorMessage(addRoot.error)}
        </p>
      {/if}
    </div>
  </div>

  {#if rootsQuery.isError}
    <ErrorAlert
      message={libraryCommandErrorMessage(rootsQuery.error)}
      onRetry={() => void rootsQuery.refetch()}
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
        {@const pending = rowPending(root.id)}
        {@const error = rowError(root.id)}
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
                {formatNumber(root.trackCount)}
                {root.trackCount === 1 ? "track" : "tracks"}
              </span>
              {#if root.missingCount > 0}
                <span class="ml-3">{formatNumber(root.missingCount)} missing</span>
              {/if}
            </ItemDescription>
            {#if error}
              <p class="mt-1 text-sm text-destructive" role="alert">
                {libraryCommandErrorMessage(error)}
              </p>
            {/if}
          </ItemContent>
          <ItemActions class="w-full justify-end gap-3 sm:w-auto">
            <Field orientation="horizontal" class="gap-2 text-sm text-muted-foreground">
              <!-- Controlled by the stored value: a failed change leaves the box where it was. -->
              <Checkbox
                id={`enabled-${root.id}`}
                bind:checked={() => root.enabled, (checked) => setRootEnabled(root.id, checked)}
                disabled={scanRunning || pending}
              />
              <FieldLabel
                for={`enabled-${root.id}`}
                class="font-normal text-muted-foreground max-sm:sr-only"
              >
                Include <span class="sr-only">{root.path} </span>in library
              </FieldLabel>
            </Field>
            <Button
              type="button"
              purpose="destructive"
              density="compact"
              aria-label={`Remove ${root.path} from library`}
              disabled={scanRunning || pending}
              onclick={() => {
                removeRoot.reset();
                removeTarget = root;
              }}
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
      <span class="ml-1 text-foreground">{formatNumber(missingTotal)} missing</span>
    </p>
    <div class="flex max-w-sm flex-col items-end gap-2">
      <div class="flex flex-wrap justify-end gap-2">
        <CompatButton
          type="button"
          variant="outline"
          size="sm"
          disabled={scanRunning || deleteMissing.isPending || missingTotal === 0}
          onclick={() => {
            deleteMissing.reset();
            deleteMissingOpen = true;
          }}
        >
          {#if deleteMissing.isPending}
            <Spinner data-icon="inline-start" aria-hidden="true" role="presentation" />
          {/if}
          Delete Missing
        </CompatButton>
        <CompatButton
          type="button"
          variant="outline"
          size="sm"
          onclick={() => {
            openLogDirectory.reset();
            openLogDirectory.mutate();
          }}
        >
          Open log folder
        </CompatButton>
      </div>
      {#if deleteMissing.error}
        <p class="text-right text-sm text-destructive" role="alert">
          {libraryCommandErrorMessage(deleteMissing.error)}
        </p>
      {/if}
      {#if openLogDirectory.error}
        <p class="text-right text-sm text-destructive" role="alert">
          {libraryCommandErrorMessage(openLogDirectory.error)}
        </p>
      {/if}
    </div>
  </div>

  <div class="mt-6 flex flex-wrap items-start justify-between gap-4 border-t border-border pt-6">
    <p class="max-w-prose text-sm leading-5 text-muted-foreground">
      Use this if the library looks wrong or cannot be opened.
    </p>
    <div class="flex max-w-sm flex-col items-end gap-2">
      <CompatButton
        type="button"
        variant="outline"
        size="sm"
        disabled={scanRunning || resetLibrary.isPending}
        onclick={() => {
          resetLibrary.reset();
          resetOpen = true;
        }}
      >
        {#if resetLibrary.isPending}
          <Spinner data-icon="inline-start" aria-hidden="true" role="presentation" />
        {/if}
        Reset library and rescan
      </CompatButton>
      {#if resetLibrary.error}
        <p class="text-right text-sm text-destructive" role="alert">
          {libraryCommandErrorMessage(resetLibrary.error)}
        </p>
      {/if}
    </div>
  </div>

  <ResetLibraryDialog
    open={resetOpen}
    onOpenChange={(open) => (resetOpen = open)}
    onConfirm={() => {
      resetOpen = false;
      resetLibrary.mutate();
    }}
  />

  <DeleteMissingDialog
    open={deleteMissingOpen}
    count={missingTotal}
    onOpenChange={(open) => (deleteMissingOpen = open)}
    onConfirm={() => {
      deleteMissingOpen = false;
      deleteMissing.mutate();
    }}
  />

  <RemoveLibraryRootDialog
    root={removeTarget}
    onOpenChange={(open) => {
      if (!open) removeTarget = null;
    }}
    onConfirm={confirmRemove}
  />
</section>
