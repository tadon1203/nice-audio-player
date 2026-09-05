<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { LibraryAlbumSummary } from '$lib/api/generated/protocol';
	interface Props {
		items: LibraryAlbumSummary[];
		hasNextPage: boolean;
		isFetchingNextPage: boolean;
		onPlay: (key: LibraryAlbumSummary['key']) => void;
		onLoadMore: () => void;
		onScrollTopChange?: (value: number) => void;
	}
	let { items, hasNextPage, isFetchingNextPage, onPlay, onLoadMore, onScrollTopChange }: Props =
		$props();
</script>

<div
	class="min-h-0 flex-1 overflow-auto"
	onscroll={(event) => onScrollTopChange?.(event.currentTarget.scrollTop)}
>
	<div class="grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
		{#each items as album (album.key.title + album.key.albumArtist)}<Button
				class="border border-border-subtle bg-surface p-4 text-start hover:bg-surface-hover"
				onclick={() => onPlay(album.key)}
				><span class="block truncate">{album.key.title}</span><span
					class="block truncate text-body-sm text-text-secondary">{album.key.albumArtist}</span
				></Button
			>{/each}
	</div>
	{#if hasNextPage}<Button
			class="mt-4 border border-border-subtle px-3 py-2"
			disabled={isFetchingNextPage}
			onclick={onLoadMore}>{isFetchingNextPage ? 'Loading…' : 'Load more'}</Button
		>{/if}
</div>
