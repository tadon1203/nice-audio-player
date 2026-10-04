<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils/cn.js";
  import { timeStateClass, type TimeState } from "./time-state";
  let {
    state,
    class: className,
    children,
    ...props
  }: HTMLAttributes<HTMLSpanElement> & { state: TimeState } = $props();
</script>

<span
  data-slot="time-ink"
  class={cn(
    "contents font-normal transition-colors duration-(--motion-move-duration) ease-(--motion-easing)",
    timeStateClass(state),
    className,
  )}
  {...props}>{@render children?.()}</span
>
