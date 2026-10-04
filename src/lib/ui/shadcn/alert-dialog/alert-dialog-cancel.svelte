<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
	import {
		legacyButtonVariants,
		type LegacyButtonVariant,
		type LegacyButtonSize,
	} from "$lib/ui/shadcn/button/index.js";
	import { cn } from "$lib/utils/cn.js";

	let {
		ref = $bindable(null),
		class: className,
		variant = "outline",
		size = "default",
		...restProps
	}: AlertDialogPrimitive.CancelProps & {
		variant?: LegacyButtonVariant;
		size?: LegacyButtonSize;
	} = $props();
</script>

<AlertDialogPrimitive.Cancel
	bind:ref
	data-slot="alert-dialog-cancel"
	class={cn(legacyButtonVariants({ variant, size }), "", className)}
	{...restProps}
/>
