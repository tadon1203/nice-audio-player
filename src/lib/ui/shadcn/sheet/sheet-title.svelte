<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
	import { Dialog as SheetPrimitive } from "bits-ui";
	import { cn } from "$lib/utils/cn.js";

	let {
		ref = $bindable(null),
		...restProps
	}: PresentationProps<SheetPrimitive.TitleProps> = $props();
</script>

<SheetPrimitive.Title
	bind:ref
	data-slot="sheet-title"
	class={cn("text-foreground text-base font-medium")}
	{...restProps}
/>
