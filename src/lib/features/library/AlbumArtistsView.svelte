<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { LibraryAlbumArtistSummary } from '$lib/api/generated/protocol';
	interface Props {
		items: LibraryAlbumArtistSummary[];
		hasNextPage: boolean;
		isFetchingNextPage: boolean;
		onLoadMore: () => void;
		onScrollTopChange?: (value: number) => void;
	}
	let { items, hasNextPage, isFetchingNextPage, onLoadMore, onScrollTopChange }: Props = $props();
</script>

<div
	class="min-h-0 flex-1 overflow-auto"
	onscroll={(event) => onScrollTopChange?.(event.currentTarget.scrollTop)}
>
	<div class="grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
		{#each items as artist (artist.key.name)}<div
				class="border border-border-subtle bg-surface p-4"
			>
				<span class="block truncate">{artist.key.name}</span><span
					class="text-body-sm text-text-secondary">{artist.albumCount} albums</span
				>
			</div>{/each}
	</div>
	{#if hasNextPage}<Button
			class="mt-4 border border-border-subtle px-3 py-2"
			disabled={isFetchingNextPage}
			onclick={onLoadMore}>{isFetchingNextPage ? 'Loading…' : 'Load more'}</Button
		>{/if}
</div>
