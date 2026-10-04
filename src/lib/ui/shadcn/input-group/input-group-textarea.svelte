<script lang="ts">
  import { cn } from "$lib/utils/cn.js";
	import { Textarea } from "$lib/ui/shadcn/textarea/index.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
    class: className,
		value = $bindable(),
		...props
	}: ComponentProps<typeof Textarea> = $props();
</script>

<Textarea
	bind:ref
	data-slot="input-group-control"
	class={cn("rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent flex-1", className)}
	bind:value
	{...props}
/>
