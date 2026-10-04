<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
	import { Dialog as SheetPrimitive } from "bits-ui";
	import { cn } from "$lib/utils/cn.js";

	let {
		ref = $bindable(null),
		truncate = false, ...restProps
	}: PresentationProps<SheetPrimitive.DescriptionProps> & { truncate?: boolean } = $props();
</script>

<SheetPrimitive.Description
	bind:ref
	data-slot="sheet-description"
	class={cn("text-muted-foreground text-sm", truncate && "truncate")}
	{...restProps}
/>
