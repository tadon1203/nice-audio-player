<script lang="ts" generics="T = never">
	import { Tooltip as TooltipPrimitive } from "bits-ui";
  import type { PresentationProps } from "$lib/ui/presentation-props";

	let { ref = $bindable(null), ...restProps }: PresentationProps<TooltipPrimitive.TriggerProps<T>> = $props();
</script>

<TooltipPrimitive.Trigger bind:ref data-slot="tooltip-trigger" {...restProps} />
