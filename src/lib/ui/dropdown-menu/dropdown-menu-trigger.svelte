<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import type { PresentationProps } from "$lib/ui/presentation-props";
  let { ref = $bindable(null), ...props }: PresentationProps<DropdownMenu.TriggerProps> = $props();
</script>

<DropdownMenu.Trigger
  bind:ref
  class="flex min-w-0 cursor-pointer items-center gap-0.5 rounded-sm text-sm font-normal outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
  {...props}
/>
