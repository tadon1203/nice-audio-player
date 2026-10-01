<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import { getPlayback } from "$lib/playback/context";

  /**
   * A ring around the play button that fills clockwise with the track's progress, in the artwork
   * colour. It is a time Strip bent into a circle, not a control's state. It is drawn straight
   * from the playback clock, so nothing re-renders with time.
   */
  const playback = getPlayback();

  const drive: Attachment<SVGCircleElement> = (node) => {
    const total = playback.durationMs;
    const draw = (positionMs: number) => {
      const fill = total !== null && total > 0 ? Math.min(1, Math.max(0, positionMs / total)) : 0;
      node.style.strokeDashoffset = String(1 - fill);
    };
    draw(playback.clock.position.get());
    const release = playback.clock.retain();
    const unsubscribe = playback.clock.position.subscribe(draw);
    return () => {
      unsubscribe();
      release();
    };
  };
</script>

<svg
  aria-hidden="true"
  data-slot="play-progress-ring"
  viewBox="0 0 42 42"
  class="pointer-events-none absolute -inset-[3px] size-[calc(100%+6px)] -rotate-90 fill-none stroke-(--artwork-accent) forced-colors:stroke-[CanvasText]"
>
  <circle
    {@attach drive}
    cx="21"
    cy="21"
    r="20"
    stroke-width="2"
    stroke-linecap="round"
    pathLength="1"
    stroke-dasharray="1 1"
  />
</svg>
