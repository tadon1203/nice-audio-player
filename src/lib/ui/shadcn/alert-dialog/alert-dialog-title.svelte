<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
	import { cn } from "$lib/utils/cn.js";

	let {
		ref = $bindable(null),
		...restProps
	}: PresentationProps<AlertDialogPrimitive.TitleProps> = $props();
</script>

<AlertDialogPrimitive.Title
	bind:ref
	data-slot="alert-dialog-title"
	class={cn("text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2")}
	{...restProps}
/>
