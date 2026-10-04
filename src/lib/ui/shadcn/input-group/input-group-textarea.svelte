<script lang="ts">
	import { Textarea } from "$lib/ui/shadcn/textarea/index.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		value = $bindable(),
		...props
	}: ComponentProps<typeof Textarea> = $props();
</script>

<Textarea
	bind:ref
	data-slot="input-group-control"
	geometry="group"
	bind:value
	{...props}
/>
