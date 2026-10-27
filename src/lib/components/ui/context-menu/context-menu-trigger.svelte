<script lang="ts">
  import { ContextMenu } from "bits-ui";
  import type { PresentationProps } from "#lib/components/ui/presentation-props";
  let { ref = $bindable(null), ...props }: PresentationProps<ContextMenu.TriggerProps> = $props();
</script>

<ContextMenu.Trigger bind:ref {...props} />
