<script lang="ts">
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import RollingNumber from "./rolling-number/rolling-number.svelte";

  /** The shared-element move (`large`) takes about this long; counting starts after it. */
  const COUNT_UP_DELAY_MS = 420;

  let { text }: { text: string } = $props();

  // Starts as the same text with every digit zeroed, then rolls to the real value.
  let shown = $state(untrack(() => text.replace(/[0-9]/g, "0")));

  // Each text is shown once the move has finished. The attachment runs again with each new text,
  // and its teardown cancels the timer of the one before.
  const showAfterMove: Attachment<HTMLElement> = () => {
    const target = text;
    const timer = setTimeout(() => (shown = target), COUNT_UP_DELAY_MS);
    return (): void => clearTimeout(timer);
  };
</script>

<span class="contents" {@attach showAfterMove}>
  <RollingNumber value={shown} direction="up" settle="right-last" />
</span>
