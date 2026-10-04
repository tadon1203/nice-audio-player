<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
	import { Select as SelectPrimitive } from "bits-ui";
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import { cn, type WithoutChildrenOrChild } from "$lib/utils/cn.js";

	let {
		ref = $bindable(null),
		...restProps
	}: PresentationProps<WithoutChildrenOrChild<SelectPrimitive.ScrollUpButtonProps>> = $props();
</script>

<SelectPrimitive.ScrollUpButton
	bind:ref
	data-slot="select-scroll-up-button"
	class={cn("bg-popover z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4")}
	{...restProps}
>
	<ChevronUpIcon  />
</SelectPrimitive.ScrollUpButton>
