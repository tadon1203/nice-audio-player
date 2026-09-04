<script lang="ts">
	import './layout.css';
	import AppShell from '$lib/components/app-shell/AppShell.svelte';
	import ApplicationNav from '$lib/components/app-shell/ApplicationNav.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

{#snippet navigation()}<ApplicationNav />{/snippet}
{#snippet content()}{@render children()}{/snippet}
<AppShell {navigation} {content} />
