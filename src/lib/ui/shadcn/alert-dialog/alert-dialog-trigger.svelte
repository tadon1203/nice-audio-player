<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import type { PresentationProps } from "$lib/ui/presentation-props";

	let { ref = $bindable(null), ...restProps }: PresentationProps<AlertDialogPrimitive.TriggerProps> = $props();
</script>

<AlertDialogPrimitive.Trigger bind:ref data-slot="alert-dialog-trigger" {...restProps} />
