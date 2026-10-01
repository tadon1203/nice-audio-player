<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import { watchClock } from "$lib/playback/clock";
  import { getPlayback } from "$lib/playback/context";
  import { formatDuration } from "$lib/utils/format";
  import { gapProgress } from "./lyrics-lines";

  /**
   * An instrumental gap: a thin bar that fills over the gap's real span while it is the current
   * line, so the wait shows how far it has got instead of an empty row. The fill is drawn straight
   * from the playback clock, so nothing re-renders with time.
   */
  let { startMs, endMs, isCurrent }: { startMs: number; endMs: number | null; isCurrent: boolean } =
    $props();

  const playback = getPlayback();

  const label = $derived(
    endMs !== null ? `Instrumental, ${formatDuration(endMs - startMs)}` : "Instrumental",
  );

  const drawFill: Attachment<HTMLElement> = (node) => {
    if (!isCurrent) {
      node.style.transform = "scaleX(0)";
      return;
    }
    return watchClock(playback.clock, (positionMs) => {
      node.style.transform = `scaleX(${gapProgress(positionMs, startMs, endMs)})`;
    });
  };
</script>

<span
  role="img"
  aria-label={label}
  data-slot="lyrics-interval"
  class="my-3 block h-0.5 w-24 overflow-hidden rounded-full bg-faint-foreground/40"
>
  <span {@attach drawFill} class="block size-full origin-left bg-(--artwork-accent)"></span>
</span>
