<script lang="ts">
  import { cn } from "$lib/utils/cn.js";
  import { Dialog as Primitive } from "bits-ui";
  import { buttonVariants, type ButtonVariant, type ButtonSize } from "$lib/ui/shadcn/button";
  let { ref = $bindable(null), class: className, variant = "quiet", size = "largeIcon", ...props }: Primitive.CloseProps & { variant?: ButtonVariant; size?: ButtonSize } = $props();
</script>

<Primitive.Close bind:ref class={cn(buttonVariants({ variant, size }), className)} {...props} />
