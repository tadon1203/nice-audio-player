<script lang="ts" module>
  import type { LibraryFileAvailability } from "$lib/native";

  export type AlbumStripTrack = {
    id: string;
    title: string;
    durationMs: number | null;
    playable: boolean;
    availability: LibraryFileAvailability;
  };

  const PAST = "bg-foreground/60";
  const IDLE = "bg-foreground/25";
</script>

<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import { isTrackAvailable } from "$lib/library/tracks";
  import { prefersReducedMotion } from "svelte/motion";
  import type { TransitionConfig } from "svelte/transition";
  import { getPlayback } from "$lib/playback/context";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import { Tooltip, TooltipContent, TooltipTrigger } from "$lib/ui/shadcn/tooltip";
  import { cn } from "$lib/utils/cn.js";
  import { segmentFill, segmentStarts, segmentStates } from "./album-strip-model";

  /**
   * Segments proportional to each track's length. They grow in left to right on entry; for the
   * playing album, past tracks are brighter, and the playing segment fills as it plays.
   */
  let {
    tracks,
    activeTrackId,
    onplaytrack,
  }: {
    tracks: readonly AlbumStripTrack[];
    activeTrackId: string | null;
    onplaytrack: (id: string) => void;
  } = $props();

  const playback = getPlayback();

  const totalMs = $derived(tracks.reduce((sum, track) => sum + (track.durationMs ?? 0), 0));
  const states = $derived(segmentStates(tracks, activeTrackId));
  const starts = $derived(segmentStarts(tracks));

  /** Grows from the left edge, later the further into the album the segment starts. */
  function sweep(_node: Element, { start }: { start: number }): TransitionConfig {
    const reduced = prefersReducedMotion.current;
    const { duration, easing } = motionFor("move");
    return {
      delay: reduced ? 0 : start * duration,
      duration,
      easing,
      css: (t) => (reduced ? `opacity: ${t}` : `transform: scaleX(${t}); opacity: ${t}`),
    };
  }

  /**
   * Draws the playing segment's fill straight from the playback clock, so neither the strip nor
   * the page re-renders with time. Retaining the clock keeps its frame loop running.
   */
  const fill =
    (rowDurationMs: number | null): Attachment<HTMLElement> =>
    (node) => {
      const total = playback.durationMs ?? rowDurationMs;
      const draw = (positionMs: number) => {
        node.style.transform = `scaleX(${segmentFill(positionMs, total)})`;
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

{#if totalMs > 0}
  <div class="flex h-1 w-full gap-0.5" role="group" aria-label="Track lengths">
    {#each tracks as track, index (track.id)}
      {@const state = states[index]}
      {@const playable = isTrackAvailable(track)}
      <Tooltip>
        <!-- Pointer-only: the track table below is the keyboard path to the same tracks. -->
        <TooltipTrigger
          type="button"
          aria-label={track.title}
          aria-current={state === "current" ? "true" : undefined}
          tabindex={-1}
          disabled={!playable}
          onclick={() => onplaytrack(track.id)}
          class="group/segment relative h-full min-w-0.5 cursor-pointer rounded-full outline-none before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] disabled:cursor-default"
          style="flex-grow: {track.durationMs ?? 0}"
        >
          <span
            aria-hidden="true"
            in:sweep|global={{ start: starts[index] ?? 0 }}
            class={cn(
              "absolute inset-0 origin-left overflow-clip rounded-full transition-colors",
              state === "past" ? PAST : IDLE,
              state === "future" && "group-hover/segment:bg-foreground/60",
            )}
          ></span>
          {#if state === "current"}
            <span
              aria-hidden="true"
              class="absolute inset-0 origin-left rounded-full bg-foreground"
              {@attach fill(track.durationMs)}
            ></span>
          {/if}
        </TooltipTrigger>
        <TooltipContent>{track.title}</TooltipContent>
      </Tooltip>
    {/each}
  </div>
{/if}
