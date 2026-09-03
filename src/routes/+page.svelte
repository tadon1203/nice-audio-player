<script lang="ts">
	import { getAppApi, ping } from '$lib/api/client';

	let status = $state('Not checked');

	async function checkBackend(): Promise<void> {
		try {
			status = String(await ping(getAppApi()));
		} catch (error) {
			status = error instanceof Error ? error.message : 'Backend unavailable';
		}
	}
</script>

<svelte:head><title>Nice Audio Player</title></svelte:head>

<main>
	<p class="eyebrow">NICE AUDIO PLAYER</p>
	<h1>Application foundation ready.</h1>
	<p>
		Electron, SvelteKit, and the Rust backend are connected through a typed application boundary.
	</p>
	<button type="button" onclick={checkBackend}>Check backend</button>
	<p aria-live="polite">Backend: {status}</p>
</main>
