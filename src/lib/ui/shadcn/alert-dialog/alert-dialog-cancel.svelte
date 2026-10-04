<script lang="ts">
  import { AlertDialog as Primitive } from "bits-ui";
  import type { PresentationProps } from "$lib/ui/presentation-props";
  import { controlButtonVariants, type ButtonPurpose, type ButtonDensity } from "$lib/ui/shadcn/button/control-styles";
  let { ref = $bindable(null), purpose = "outline", density = "standard", ...props }: PresentationProps<Primitive.CancelProps> & { purpose?: ButtonPurpose; density?: ButtonDensity } = $props();
</script>

<Primitive.Cancel bind:ref class={controlButtonVariants({ purpose, density })} {...props} />
