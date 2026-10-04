<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
	import { Select as SelectPrimitive } from "bits-ui";
	import { cn } from "$lib/utils/cn.js";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		children,
		...restProps
	}: PresentationProps<ComponentProps<typeof SelectPrimitive.GroupHeading>> = $props();
</script>

<SelectPrimitive.GroupHeading
	bind:ref
	data-slot="select-group-heading"
	class={cn("text-muted-foreground px-1.5 py-1 text-sm")}
	{...restProps}
>
	{@render children?.()}
</SelectPrimitive.GroupHeading>
