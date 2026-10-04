<script lang="ts">
	import { Input } from "$lib/ui/shadcn/input/index.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		value = $bindable(),
		...props
	}: ComponentProps<typeof Input> = $props();
</script>

<Input
	bind:ref
	data-slot="input-group-control"
	geometry="group"
	bind:value
	{...props}
/>
