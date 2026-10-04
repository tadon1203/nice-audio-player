<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
	import { Select as SelectPrimitive } from "bits-ui";
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { cn, type WithoutChildrenOrChild } from "$lib/utils/cn.js";

	let {
		ref = $bindable(null),
		...restProps
	}: PresentationProps<WithoutChildrenOrChild<SelectPrimitive.ScrollDownButtonProps>> = $props();
</script>

<SelectPrimitive.ScrollDownButton
	bind:ref
	data-slot="select-scroll-down-button"
	class={cn("bg-popover z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4")}
	{...restProps}
>
	<ChevronDownIcon  />
</SelectPrimitive.ScrollDownButton>
