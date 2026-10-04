<script lang="ts">
  import { Label as Primitive } from "bits-ui";
  import type { PresentationProps } from "$lib/ui/presentation-props";
  let { ref = $bindable(null), stacked = false, ...props }: PresentationProps<Primitive.RootProps> & { stacked?: boolean } = $props();
</script>
<Primitive.Root bind:ref data-slot="field-label" class={["group/field-label peer/field-label flex w-fit text-sm font-normal leading-snug group-data-[disabled=true]/field:opacity-50", stacked ? "flex-col items-start gap-0.5" : "items-center gap-2"]} {...props} />
