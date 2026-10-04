<script lang="ts">
  import type { Snippet } from "svelte";
  import { timeStateClass, type TimeState } from "./time-state";

  // Sequencing, anchors and actions stay with Queue/lyrics. This owner supplies readable ink.
  let {
    state,
    lyric = false,
    children,
  }: {
    state: TimeState;
    lyric?: boolean;
    children: Snippet;
    class?: never;
    style?: never;
  } = $props();
</script>

<span
  data-slot="time-ink"
  class={[
    lyric ? "inline" : "contents",
    "font-normal transition-colors duration-(--motion-move-duration) ease-(--motion-easing)",
    lyric && state === "present" ? "text-(--artwork-accent)" : timeStateClass(state),
    lyric && "in-data-[mode=free]:text-foreground",
  ]}>{@render children()}</span
>
