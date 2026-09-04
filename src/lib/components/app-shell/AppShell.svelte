<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';

	interface Props {
		navigation: Snippet;
		content: Snippet;
		context?: Snippet;
		activity?: Snippet;
		dock?: Snippet;
	}
	let { navigation, content, context, activity, dock }: Props = $props();
	const contextOverlay = new MediaQuery('max-width: 1439px', false);
	const contextOpen = $derived(context !== undefined);
</script>

<div
	data-testid="app-shell"
	class="relative grid h-[100dvh] w-full grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-canvas"
>
	<div
		data-slot="app-workspace"
		data-context-open={contextOpen ? 'true' : 'false'}
		class="relative grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] app-wide:grid-cols-[192px_minmax(0,1fr)] app-wide:grid-rows-1 {contextOpen
			? 'context-split:grid-cols-[192px_minmax(0,1fr)_clamp(360px,28vw,400px)]'
			: ''}"
	>
		{@render navigation()}
		<main
			data-slot="app-main"
			class="col-start-1 row-start-2 min-h-0 min-w-0 overflow-hidden app-wide:col-start-2 app-wide:row-start-1"
			inert={contextOpen && contextOverlay.current ? true : undefined}
			aria-hidden={contextOpen && contextOverlay.current ? 'true' : undefined}
		>
			<div class="h-full min-h-0 min-w-0">{@render content()}</div>
		</main>
		{#if context}<div
				data-slot="app-context-pane"
				class="z-10 col-start-1 row-start-2 h-full min-h-0 min-w-0 overflow-hidden app-wide:col-start-2 app-wide:row-start-1 context-split:col-start-3"
			>
				{@render context()}
			</div>{/if}
		{#if activity}<div
				data-slot="app-activity"
				class="inset-block-end-3 pointer-events-none absolute start-6 z-2 max-w-[min(360px,calc(100%-32px))] app-wide:start-[208px]"
			>
				{@render activity()}
			</div>{/if}
	</div>
	{#if dock}<footer
			data-slot="app-persistent"
			class="max-h-[100dvh] min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain"
		>
			{@render dock()}
		</footer>{/if}
</div>
