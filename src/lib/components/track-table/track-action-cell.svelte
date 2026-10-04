<script lang="ts">
  import PlayPauseIcon from "$lib/ui/play-pause-icon.svelte";
  import { Button } from "$lib/ui/shadcn/button/index.js";
  import { cn } from "$lib/utils/cn.js";
  import { MISSING } from "$lib/utils/format";
  import type { TrackRowAction, TrackTableLayout, TrackTableRow } from "./track-columns";

  let {
    row,
    action,
    available,
    layout,
    run,
  }: {
    row: TrackTableRow;
    action: TrackRowAction;
    available: boolean;
    layout: TrackTableLayout;
    /** Runs the action: play, pause or resume. */
    run: () => void;
  } = $props();
</script>

{#snippet actionButton()}
  <Button
    type="button"
    variant="quiet"
    size="largeIcon"
    aria-label={action.label}
    title={action.label}
    disabled={!available}
    onclick={(event) => {
      event.stopPropagation();
      run();
    }}
  >
    <PlayPauseIcon playing={action.kind === "pause"} />
  </Button>
{/snippet}

{#if layout === "album"}
  <!-- The number and the button are two stacked cells in a one-cell window;
       hover slides the number up and the button in. The ring sits on the
       window so the clip does not cut it. -->
  <div class="flex h-9 w-full items-center justify-center">
    <div
      class="size-9 overflow-clip rounded-md has-focus-visible:ring-2 has-focus-visible:ring-ring"
    >
      <div
        class={cn(
          "flex flex-col transition-transform duration-(--motion-move-duration) ease-(--motion-easing)",
          action.persistent && "-translate-y-9",
          available &&
            !action.persistent &&
            "group-focus-within/track:-translate-y-9 group-hover/track:-translate-y-9",
        )}
      >
        <span
          aria-hidden="true"
          class="flex size-9 items-center justify-center text-sm text-muted-foreground"
        >
          {row.trackNumber ?? MISSING}
        </span>
        {@render actionButton()}
      </div>
    </div>
  </div>
{:else}
  <div class="relative flex h-9 w-full items-center justify-center">
    <div
      class={cn(
        "absolute transition-opacity",
        !action.persistent &&
          "opacity-0 group-hover/track:opacity-100 group-focus-within/track:opacity-100",
        !available && !action.persistent && "pointer-events-none opacity-0 disabled:opacity-0",
      )}
    >
      {@render actionButton()}
    </div>
  </div>
{/if}
