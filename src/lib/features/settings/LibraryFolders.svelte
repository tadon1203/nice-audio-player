<script lang="ts">
	import { onMount } from 'svelte';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { Spinner } from '$lib/components/ui/spinner';
	import AppProgress from '$lib/components/primitives/AppProgress.svelte';
	import { libraryApi } from '$lib/api/library';
	import type { LibraryRoot, LibraryScanSnapshot } from '$lib/api/contracts';
	let roots = $state<LibraryRoot[]>([]);
	let scan = $state<LibraryScanSnapshot | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let removeTarget = $state<LibraryRoot | null>(null);
	async function refresh(): Promise<void> {
		roots = await libraryApi.roots();
		scan = await libraryApi.scanState();
	}
	async function addFolder(): Promise<void> {
		const path = await libraryApi.selectDirectory();
		if (!path) return;
		busy = true;
		try {
			await libraryApi.registerRoot(path);
			await refresh();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Folder could not be added';
		} finally {
			busy = false;
		}
	}
	async function scanLibrary(): Promise<void> {
		busy = true;
		try {
			await libraryApi.startScan();
			scan = await libraryApi.scanState();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Scan could not start';
		} finally {
			busy = false;
		}
	}
	async function cancelScan(): Promise<void> {
		try {
			await libraryApi.cancelScan();
			scan = await libraryApi.scanState();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Scan could not be cancelled';
		}
	}
	async function toggle(root: LibraryRoot): Promise<void> {
		try {
			await libraryApi.setRootEnabled(root.id, !root.enabled);
			await refresh();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Folder could not be updated';
		}
	}
	async function remove(): Promise<void> {
		if (!removeTarget) return;
		try {
			await libraryApi.removeRoot(removeTarget.id);
			removeTarget = null;
			await refresh();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Folder could not be removed';
		}
	}
	onMount(() => {
		void refresh().catch((cause: unknown) => {
			error = cause instanceof Error ? cause.message : 'Library settings unavailable';
		});
	});
	const running = $derived(scan?.state === 'running');
	const progress = $derived(
		scan && scan.discoveredCount
			? Math.min(100, ((scan.inspectedCount ?? 0) / scan.discoveredCount) * 100)
			: null
	);
</script>

<section
	class="flex h-full min-h-0 flex-col gap-6 overflow-auto p-6 app-wide:p-10"
	aria-labelledby="folders-title"
>
	<div>
		<p class="text-body-sm text-text-muted">Settings</p>
		<h2 id="folders-title" class="text-body-lg">Library folders</h2>
	</div>
	<div class="flex flex-wrap gap-3">
		<Button
			class="rounded-control bg-text-primary px-4 py-2 text-canvas disabled:opacity-50"
			disabled={busy || running}
			onclick={() => void addFolder()}
			>{#if busy}<Spinner />{/if}Add folder</Button
		><Button
			variant="outline"
			class="rounded-control border border-border-subtle px-4 py-2 disabled:opacity-50"
			disabled={busy || running || roots.length === 0}
			onclick={() => void scanLibrary()}
			>{#if busy}<Spinner />{/if}Rescan</Button
		>{#if running}<Button
				variant="outline"
				class="rounded-control border border-border-subtle px-4 py-2"
				onclick={() => void cancelScan()}>Cancel</Button
			>{/if}
	</div>
	{#if scan && scan.state !== 'idle'}<div role="status" class="grid gap-2 text-text-secondary">
			{#if running}Scanning {scan.currentRoot?.path ?? 'library'} ·
			{/if}{scan.inspectedCount} inspected / {scan.discoveredCount} discovered
			{#if running}<AppProgress
					value={progress}
					aria-label="Library scan progress"
					class="bg-surface-muted h-1 overflow-hidden rounded-full"
				></AppProgress>{/if}
		</div>{/if}
	{#if error}<Alert variant="destructive">
			<AlertTitle>Library operation failed</AlertTitle>
			<AlertDescription>{error}</AlertDescription>
		</Alert>{/if}
	<div class="grid gap-2">
		{#each roots as root (root.id)}<div
				class="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle py-4"
			>
				<Label class="flex min-w-0 items-center gap-3">
					<Checkbox
						checked={root.enabled}
						onCheckedChange={() => void toggle(root)}
						aria-label={`Enable ${root.path}`}
						class="grid size-5 place-items-center rounded-control border border-border-subtle data-[state=checked]:bg-text-primary"
					></Checkbox>
					<span class="truncate">{root.path}</span>
				</Label><Button
					variant="link"
					class="text-body-sm text-text-secondary underline"
					disabled={running}
					onclick={() => (removeTarget = root)}>Remove</Button
				>
			</div>{:else}<p class="text-text-muted">No folders registered.</p>{/each}
	</div>
</section>

<AlertDialog.Root
	open={removeTarget !== null}
	onOpenChange={(open) => {
		if (!open) removeTarget = null;
	}}
>
	<AlertDialog.Content
		class="rounded-panel shadow-panel fixed top-1/2 left-1/2 grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 border border-border-subtle bg-surface p-6"
	>
		<AlertDialog.Title class="text-body-lg">Remove library folder?</AlertDialog.Title>
		<AlertDialog.Description class="text-body-sm text-text-secondary"
			>{removeTarget?.path}</AlertDialog.Description
		>
		<div class="flex justify-end gap-2">
			<AlertDialog.Cancel class="rounded-control border border-border-subtle px-4 py-2" autofocus
				>Cancel</AlertDialog.Cancel
			>
			<AlertDialog.Action
				class="rounded-control bg-text-primary px-4 py-2 text-canvas"
				onclick={() => void remove()}>Remove</AlertDialog.Action
			>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>
