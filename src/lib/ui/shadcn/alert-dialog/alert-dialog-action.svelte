<script lang="ts">
  import { AlertDialog as Primitive } from "bits-ui";
  import type { PresentationProps } from "$lib/ui/presentation-props";
  import { controlButtonVariants, type ButtonPurpose, type ButtonDensity } from "$lib/ui/shadcn/button/control-styles";
  let { ref = $bindable(null), purpose = "primary", density = "standard", ...props }: PresentationProps<Primitive.ActionProps> & { purpose?: ButtonPurpose; density?: ButtonDensity } = $props();
</script>

<Primitive.Action bind:ref class={controlButtonVariants({ purpose, density })} {...props} />
