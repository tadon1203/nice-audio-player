<script lang="ts">
  import { cn } from "$lib/utils/cn.js";
  import { AlertDialog as Primitive } from "bits-ui";
  import { buttonVariants, type ButtonVariant, type ButtonSize } from "$lib/ui/shadcn/button";
  let { ref = $bindable(null), class: className, variant = "primary", size = "standard", ...props }: Primitive.ActionProps & { variant?: ButtonVariant; size?: ButtonSize } = $props();
</script>

<Primitive.Action bind:ref class={cn(buttonVariants({ variant, size }), className)} {...props} />
