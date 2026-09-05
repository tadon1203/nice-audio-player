<script lang="ts">
	import { get } from 'svelte/store';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { Button } from '$lib/components/ui/button';
	import type { LibraryTrackSummary } from '$lib/api/generated/protocol';

	interface Props {
		items: LibraryTrackSummary[];
		hasNextPage: boolean;
		isFetchingNextPage: boolean;
		onPlay: (id: string) => void;
		onLoadMore: () => void;
		onScrollTopChange?: (value: number) => void;
	}
	let { items, hasNextPage, isFetchingNextPage, onPlay, onLoadMore, onScrollTopChange }: Props =
		$props();
	let listElement = $state<HTMLDivElement | null>(null);
	const virtualizer = createVirtualizer<HTMLDivElement, HTMLButtonElement>({
		get count() {
			return items.length;
		},
		getScrollElement: () => listElement,
		estimateSize: () => 52,
		overscan: 8
	});
	$effect(() => {
		const count = items.length;
		get(virtualizer).setOptions({ count });
	});
	const virtualItems = $derived.by(() => $virtualizer.getVirtualItems());
</script>

<div
	bind:this={listElement}
	class="min-h-0 flex-1 overflow-auto"
	onscroll={() => {
		onScrollTopChange?.(listElement?.scrollTop ?? 0);
		const last = virtualItems.at(-1);
		if (last && last.index >= items.length - 5 && hasNextPage && !isFetchingNextPage) onLoadMore();
	}}
>
	<div class="relative" style:height={`${$virtualizer.getTotalSize()}px`}>
		{#each virtualItems as item (item.key)}
			{@const track = items[item.index]}
			{#if track}<Button
					class="absolute inset-x-0 grid h-13 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b border-border-subtle px-3 py-3 text-start hover:bg-surface-hover disabled:opacity-50"
					style={`transform: translateY(${item.start}px)`}
					disabled={!track.playable}
					onclick={() => onPlay(track.id)}
				>
					<span class="truncate">{track.title}</span>
					<span class="truncate text-text-secondary">{track.artist ?? 'Unknown artist'}</span>
					<span class="truncate text-text-muted">{track.album ?? 'Unknown album'}</span>
				</Button>
			{/if}
		{/each}
	</div>
</div>
