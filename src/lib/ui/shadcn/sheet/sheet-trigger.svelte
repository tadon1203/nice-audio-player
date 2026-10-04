<script lang="ts">
  import { Dialog as Primitive } from "bits-ui";
  import type { PresentationProps } from "$lib/ui/presentation-props";
  import { controlButtonVariants, type ButtonPurpose, type ButtonDensity } from "$lib/ui/shadcn/button/control-styles";
  let { ref = $bindable(null), purpose = "quiet", density = "largeIcon", ...props }: PresentationProps<Primitive.TriggerProps> & { purpose?: ButtonPurpose; density?: ButtonDensity } = $props();
</script>

<Primitive.Trigger bind:ref class={controlButtonVariants({ purpose, density })} {...props} />
