<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tabs from '$lib/components/ui/tabs';
	import { libraryApi } from '$lib/api/library';
	import type {
		LibraryAlbumKey,
		LibraryAlbumArtistPage,
		LibraryAlbumPage,
		LibraryTrackPage
	} from '$lib/api/contracts';
	import { libraryViewState } from './library-view-state.svelte';
	import AlbumsView from './AlbumsView.svelte';
	import AlbumArtistsView from './AlbumArtistsView.svelte';
	import { createAlbumArtistsQuery, createAlbumsQuery, createTracksQuery } from './queries';
	import TracksView from './TracksView.svelte';
	import { getPlaybackController } from '$lib/features/playback/playback-context.svelte';

	const playbackController = getPlaybackController();
	let error = $state<string | null>(null);
	const tracksQuery = createTracksQuery(() => libraryViewState.searches.tracks);
	const albumsQuery = createAlbumsQuery(() => libraryViewState.searches.albums);
	const artistsQuery = createAlbumArtistsQuery(() => libraryViewState.searches.albumArtists);
	const trackItems = $derived(
		tracksQuery.data?.pages.flatMap((page: LibraryTrackPage) => page.items) ?? []
	);
	const albumItems = $derived(
		albumsQuery.data?.pages.flatMap((page: LibraryAlbumPage) => page.items) ?? []
	);
	const artistItems = $derived(
		artistsQuery.data?.pages.flatMap((page: LibraryAlbumArtistPage) => page.items) ?? []
	);

	async function playTrack(id: string): Promise<void> {
		try {
			playbackController.update(await libraryApi.startTrack(id));
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Playback failed';
		}
	}
	async function playAlbum(key: LibraryAlbumKey): Promise<void> {
		try {
			playbackController.update(await libraryApi.startAlbum(key));
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Playback failed';
		}
	}
	function loadMore(): void {
		if (
			libraryViewState.presentation === 'tracks' &&
			tracksQuery.hasNextPage &&
			!tracksQuery.isFetchingNextPage
		)
			void tracksQuery.fetchNextPage();
		if (
			libraryViewState.presentation === 'albums' &&
			albumsQuery.hasNextPage &&
			!albumsQuery.isFetchingNextPage
		)
			void albumsQuery.fetchNextPage();
		if (
			libraryViewState.presentation === 'albumArtists' &&
			artistsQuery.hasNextPage &&
			!artistsQuery.isFetchingNextPage
		)
			void artistsQuery.fetchNextPage();
	}
</script>

<section
	class="flex h-full min-h-0 flex-col gap-6 p-6 app-wide:p-10"
	aria-labelledby="library-browser-title"
>
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="text-body-sm text-text-muted">Collection</p>
			<h2 id="library-browser-title" class="text-body-lg">Library</h2>
		</div>
		<Input
			class="h-10 min-w-48 rounded-control border border-border-subtle bg-surface px-3"
			bind:value={libraryViewState.searches[libraryViewState.presentation]}
			placeholder="Filter library"
			aria-label="Filter library"
		/>
	</div>
	<Tabs.Root bind:value={libraryViewState.presentation} class="min-h-0 flex-1">
		<Tabs.List variant="line" aria-label="Library views" class="border-b border-border-subtle">
			<Tabs.Trigger value="albums" class="px-3 py-2 text-body-sm text-text-secondary"
				>Albums</Tabs.Trigger
			>
			<Tabs.Trigger value="albumArtists" class="px-3 py-2 text-body-sm text-text-secondary"
				>Album Artists</Tabs.Trigger
			>
			<Tabs.Trigger value="tracks" class="px-3 py-2 text-body-sm text-text-secondary"
				>Tracks</Tabs.Trigger
			>
		</Tabs.List>
		<Tabs.Content value="albums" class="min-h-0 flex-1">
			{#if albumsQuery.isError}<p role="alert" class="text-error">{albumsQuery.error.message}</p>
			{:else if albumsQuery.isPending}<p role="status" class="text-text-muted">
					Loading library… <Skeleton class="mt-3 h-10 w-full" />
				</p>
			{:else if error}<p role="alert" class="text-error">{error}</p>
			{:else}<AlbumsView
					items={albumItems}
					hasNextPage={albumsQuery.hasNextPage}
					isFetchingNextPage={albumsQuery.isFetchingNextPage}
					onPlay={playAlbum}
					onLoadMore={loadMore}
					onScrollTopChange={(value: number) => {
						libraryViewState.scrollTop.albums = value;
					}}
				/>{/if}
		</Tabs.Content>
		<Tabs.Content value="albumArtists" class="min-h-0 flex-1">
			{#if artistsQuery.isError}<p role="alert" class="text-error">{artistsQuery.error.message}</p>
			{:else if artistsQuery.isPending}<p role="status" class="text-text-muted">
					Loading library… <Skeleton class="mt-3 h-10 w-full" />
				</p>
			{:else if error}<p role="alert" class="text-error">{error}</p>
			{:else}<AlbumArtistsView
					items={artistItems}
					hasNextPage={artistsQuery.hasNextPage}
					isFetchingNextPage={artistsQuery.isFetchingNextPage}
					onLoadMore={loadMore}
					onScrollTopChange={(value: number) => {
						libraryViewState.scrollTop.albumArtists = value;
					}}
				/>{/if}
		</Tabs.Content>
		<Tabs.Content value="tracks" class="min-h-0 flex-1">
			{#if tracksQuery.isError}<p role="alert" class="text-error">{tracksQuery.error.message}</p>
			{:else if tracksQuery.isPending}<p role="status" class="text-text-muted">
					Loading library… <Skeleton class="mt-3 h-10 w-full" />
				</p>
			{:else if error}<p role="alert" class="text-error">{error}</p>
			{:else}<TracksView
					items={trackItems}
					hasNextPage={tracksQuery.hasNextPage}
					isFetchingNextPage={tracksQuery.isFetchingNextPage}
					onPlay={playTrack}
					onLoadMore={loadMore}
					onScrollTopChange={(value: number) => {
						libraryViewState.scrollTop.tracks = value;
					}}
				/>{/if}
		</Tabs.Content>
	</Tabs.Root>
</section>
