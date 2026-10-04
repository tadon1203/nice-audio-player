<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
	import { cn, type WithElementRef } from "$lib/utils/cn.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		children,
		...restProps
	}: PresentationProps<WithElementRef<HTMLAttributes<HTMLDivElement>> & {}> = $props();
</script>

<div
	bind:this={ref}
	data-slot="select-label"
	class={cn("text-muted-foreground px-1.5 py-1 text-sm")}
	{...restProps}
>
	{@render children?.()}
</div>
