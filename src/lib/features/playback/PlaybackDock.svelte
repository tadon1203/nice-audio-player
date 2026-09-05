<script lang="ts">
	import type { PlaybackMirror } from './playback-context.svelte';

	let { playbackState }: { playbackState: PlaybackMirror } = $props();
</script>

<div
	data-testid="playback-dock"
	class="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-border-subtle bg-surface px-6 py-3"
>
	<div class="min-w-0">
		<p class="truncate text-body-md">
			{playbackState.snapshot?.file?.fileName ?? 'Nothing playing'}
		</p>
		{#if playbackState.status === 'unavailable' || playbackState.status === 'failed'}
			<p role="alert" class="text-body-sm text-error">
				{playbackState.error ?? playbackState.snapshot?.error ?? 'Playback failed'}
			</p>
		{:else}
			<p class="text-body-sm text-text-muted">
				{playbackState.snapshot?.status ?? 'stopped'}
			</p>
		{/if}
	</div>
	<div aria-label="Playback status" class="text-body-sm text-text-secondary">
		{playbackState.snapshot?.status ?? 'stopped'}
	</div>
</div>
