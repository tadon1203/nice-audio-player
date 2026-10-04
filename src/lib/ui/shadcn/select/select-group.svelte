<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
	import { Select as SelectPrimitive } from "bits-ui";
	import { cn } from "$lib/utils/cn.js";

	let {
		ref = $bindable(null),
		...restProps
	}: PresentationProps<SelectPrimitive.GroupProps> = $props();
</script>

<SelectPrimitive.Group
	bind:ref
	data-slot="select-group"
	class={cn("scroll-my-1 p-1")}
	{...restProps}
/>
