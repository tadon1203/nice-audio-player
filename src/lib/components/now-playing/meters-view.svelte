<script lang="ts">
  import { Button } from "#lib/ui/shadcn/button";
  import { BALLISTICS } from "#lib/meters/ballistics";
  import { MeterDraw } from "#lib/meters/meter-draw";
  import { cn } from "#lib/utils/cn.js";
  import { MeterView } from "./meter-view.svelte";

  /**
   * Now Playing's Meters view: the Spectrum and the Level meter (L, R) as bare bars on the
   * surface, in the foreground colour (never the artwork's). It is mounted only while the view is
   * chosen, and runs only while motion is allowed and the window is visible: one draw loop, the
   * Meter feed subscribed for exactly that long. Wide, a stage of axis | L | R | Spectrum; narrow
   * (below 32rem of its own width), the Spectrum on top and L and R as two horizontal bars below.
   */
  let { class: className }: { class?: string } = $props();

  const CHANNELS = [0, 1] as const;
  const TAGS = ["L", "R"] as const;

  const view = new MeterView();
</script>

{#snippet readout(channel: 0 | 1)}
  {#if view.calm}
    <span
      class={cn(
        "self-center justify-self-start px-1 text-sm leading-[1.375rem] tabular-nums text-muted-foreground",
        view.narrow ? "order-3" : "",
      )}
    >
      {view.floorText}
    </span>
  {:else if view.clips[channel]}
    <span class={cn("self-center justify-self-start", view.narrow && "order-3")}>
      <Button
        type="button"
        onclick={() => view.clearClip(channel)}
        variant="primary"
        size="inline"
        class="h-auto min-w-8 p-0 tabular-nums font-normal"
      >
        Clip
      </Button>
    </span>
  {:else}
    <span
      class={cn(
        "self-center justify-self-start px-1 text-sm leading-[1.375rem] tabular-nums text-muted-foreground",
        view.narrow && "order-3",
      )}
    >
      {view.readouts[channel]}
    </span>
  {/if}
{/snippet}

<section
  {@attach view.observeLayout}
  aria-label="Meters"
  data-layout={view.layout}
  class={cn(
    "grid h-full min-h-0 min-w-0 gap-x-2 tabular-nums",
    view.narrow
      ? "grid-cols-1 grid-rows-[minmax(0,1fr)_auto_auto] gap-y-2"
      : "grid-cols-[2.5rem_3.5rem_3.5rem_minmax(0,1fr)]",
    className,
  )}
>
  {#if !view.narrow}
    <div class="grid min-h-0 grid-rows-[1.75rem_minmax(0,1fr)_1.75rem]" aria-hidden="true">
      <span></span>
      <div class="relative min-h-0">
        {#each MeterDraw.axisTicks as db (db)}
          <span
            class="absolute right-0 -translate-y-1/2 text-sm text-faint-foreground"
            style:top="{(-db / -BALLISTICS.floorDb) * 100}%"
          >
            {db}
          </span>
        {/each}
      </div>
      <span></span>
    </div>
  {/if}

  {#each CHANNELS as channel (channel)}
    <div
      class={cn(
        "grid min-h-0",
        view.narrow
          ? "h-10 grid-cols-[1.5rem_minmax(0,1fr)_4.5rem]"
          : "grid-rows-[1.75rem_minmax(0,1fr)_1.75rem]",
        view.narrow && (channel === 0 ? "order-2" : "order-3"),
      )}
    >
      {@render readout(channel)}
      <div class={cn("relative min-h-0", view.narrow && "order-2")}>
        <canvas
          {@attach view.fit(channel === 0 ? "left" : "right")}
          aria-hidden="true"
          class={cn("absolute inset-0 block size-full text-foreground", view.calm && "opacity-25")}
        ></canvas>
      </div>
      <span
        class={cn(
          "self-center justify-self-start text-sm text-muted-foreground",
          view.narrow && "order-1",
        )}
      >
        {TAGS[channel]}
      </span>
    </div>
  {/each}

  <div
    class={cn(
      "grid min-h-0",
      view.narrow
        ? "order-1 grid-rows-[minmax(0,1fr)_1.75rem]"
        : "ml-6 grid-rows-[1.75rem_minmax(0,1fr)_1.75rem]",
    )}
  >
    {#if !view.narrow}
      <span></span>
    {/if}
    <div class="relative min-h-0">
      <canvas
        {@attach view.fit("spectrum")}
        aria-hidden="true"
        class={cn("absolute inset-0 block size-full text-foreground", view.calm && "opacity-25")}
      ></canvas>
      {#if view.calm}
        <p
          role="status"
          class="absolute inset-0 grid place-items-center p-4 text-center text-muted-foreground"
        >
          Calm motion is on, so the meters are stopped.
        </p>
      {/if}
    </div>
    <div class="relative" aria-hidden="true">
      {#each MeterView.bandLabels as label (label.text)}
        <span
          class="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm whitespace-nowrap text-muted-foreground"
          style:left="{label.left}%"
        >
          {label.text}
        </span>
      {/each}
    </div>
  </div>
</section>
