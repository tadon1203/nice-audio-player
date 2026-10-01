<script lang="ts">
  import { untrack } from "svelte";
  import RollingNumber from "./rolling-number/rolling-number.svelte";

  /** The shared-element move (`largeMove`) takes about this long; counting starts after it. */
  const COUNT_UP_DELAY_MS = 420;

  let { text }: { text: string } = $props();

  // Starts as the same text with every digit zeroed, then rolls to the real value.
  let shown = $state(untrack(() => text.replace(/[0-9]/g, "0")));
  $effect(() => {
    const target = text;
    const timer = setTimeout(() => (shown = target), COUNT_UP_DELAY_MS);
    return () => clearTimeout(timer);
  });
</script>

<RollingNumber value={shown} direction="up" settle="right-last" />
