<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
	import { cn, type WithElementRef } from "$lib/utils/cn.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		children,
		...restProps
	}: PresentationProps<WithElementRef<HTMLAttributes<HTMLDivElement>>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="alert-dialog-media"
	class={cn("bg-muted mb-2 inline-flex size-10 items-center justify-center rounded-md sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6")}
	{...restProps}
>
	{@render children?.()}
</div>
