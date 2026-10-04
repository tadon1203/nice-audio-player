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
	data-slot="sheet-footer"
	class={cn("gap-2 p-4 mt-auto flex flex-col")}
	{...restProps}
>
	{@render children?.()}
</div>
