<script lang="ts">
  import { Label as Primitive } from "bits-ui";
  import { cn } from "$lib/utils/cn.js";
  let { ref = $bindable(null), class: className, ...props }: Primitive.RootProps = $props();
</script>
<Primitive.Root bind:ref data-slot="field-label" class={cn("group/field-label peer/field-label flex w-fit text-sm font-normal leading-snug group-data-[disabled=true]/field:opacity-50 items-center gap-2", className)} {...props} />
