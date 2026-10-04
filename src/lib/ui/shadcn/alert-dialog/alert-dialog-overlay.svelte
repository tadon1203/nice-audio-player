<script lang="ts">
  import type { PresentationProps } from "$lib/ui/presentation-props";
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
	import { cn } from "$lib/utils/cn.js";

	let {
		ref = $bindable(null),
		layer, ...restProps
	}: PresentationProps<AlertDialogPrimitive.OverlayProps> & { layer: number } = $props();
</script>

<AlertDialogPrimitive.Overlay
	bind:ref
  style={`z-index: ${layer}`}
	data-slot="alert-dialog-overlay"
	class={cn("floating-overlay fixed inset-0  bg-black/10 supports-backdrop-filter:backdrop-blur-xs motion-overlay-fade")}
	{...restProps}
/>
