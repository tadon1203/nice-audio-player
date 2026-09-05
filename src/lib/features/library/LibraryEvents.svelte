<script lang="ts">
	import { useQueryClient } from '@tanstack/svelte-query';
	import { getAppApi } from '$lib/api/client';
	import { isTerminalLibraryScan } from './events';
	const queryClient = useQueryClient();
	$effect(() => {
		let api;
		try {
			api = getAppApi();
		} catch {
			return;
		}
		const unsubscribe = api.onEvent((event) => {
			if (event.event === 'libraryScanStateChanged' && isTerminalLibraryScan(event.payload))
				void queryClient.invalidateQueries({ queryKey: ['library'] });
		});
		return unsubscribe;
	});
</script>
