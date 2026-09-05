<script lang="ts">
	import './layout.css';
	import AppShell from '$lib/components/app-shell/AppShell.svelte';
	import ApplicationNav from '$lib/components/app-shell/ApplicationNav.svelte';
	import type { PlaybackState } from '$lib/api/contracts';
	import type { Snippet } from 'svelte';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import LibraryEvents from '$lib/features/library/LibraryEvents.svelte';
	import PlaybackDock from '$lib/features/playback/PlaybackDock.svelte';
	import { onMount } from 'svelte';
	import { shouldApplyPlaybackSnapshot } from '$lib/features/playback/playback-state';
	import {
		setPlaybackController,
		type PlaybackMirror
	} from '$lib/features/playback/playback-context.svelte';
	import { initializePlaybackSession } from '$lib/features/playback/playback-session.svelte';

	let { children }: { children: Snippet } = $props();
	const queryClient = new QueryClient();
	let playbackState = $state<PlaybackMirror>({
		snapshot: null,
		status: 'loading',
		error: null
	});
	const playbackController = {
		update(next: PlaybackState) {
			if (shouldApplyPlaybackSnapshot(playbackState.snapshot, next)) {
				playbackState.snapshot = next;
			}
		}
	};
	setPlaybackController(playbackController);
	onMount(() => {
		void initializePlaybackSession(
			(playback) => playbackController.update(playback),
			(status) => (playbackState.status = status),
			(error) => (playbackState.error = error)
		);
	});
</script>

{#snippet navigation()}<ApplicationNav />{/snippet}
{#snippet content()}{@render children()}{/snippet}
{#snippet dock()}<PlaybackDock {playbackState} />{/snippet}
<QueryClientProvider client={queryClient}>
	<AppShell {navigation} {content} {dock} />
	<LibraryEvents />
</QueryClientProvider>
