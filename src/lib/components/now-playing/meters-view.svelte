<script lang="ts">
  import { Button } from "$lib/ui/shadcn/button";
  import type { Attachment } from "svelte/attachments";
  import {
    BALLISTICS,
    BAND_COUNT,
    clearClip,
    initialDisplay,
    stepDisplay,
  } from "$lib/meters/ballistics";
  import type { DisplayState } from "$lib/meters/ballistics";
  import { reduceFrames } from "$lib/meters/frame";
  import { AXIS_TICKS, drawLevel, drawSpectrum } from "$lib/meters/meter-draw";
  import { createMeterFeed } from "$lib/meters/meter-feed.svelte";
  import { formatHeldPeak } from "$lib/meters/readout";
  import { getPlayback } from "$lib/playback/context";
  import { getSettings } from "$lib/settings/context";
  import { cn } from "$lib/utils/cn.js";

  /**
   * Now Playing's Meters view: the Spectrum and the Level meter (L, R) as bare bars on the
   * surface, in the foreground colour (never the artwork's). It is mounted only while the view is
   * chosen, and runs only while motion is allowed and the window is visible: one draw loop, the
   * Meter feed subscribed for exactly that long. Wide, a stage of axis | L | R | Spectrum; narrow
   * (below 32rem of its own width), the Spectrum on top and L and R as two horizontal bars below.
   */
  let { class: className }: { class?: string } = $props();

  const NARROW_BELOW_PX = 512;
  const READOUT_MS = 250;
  const LABELLED: Record<number, string> = {
    1: "31",
    4: "63",
    7: "125",
    10: "250",
    13: "500",
    16: "1k",
    19: "2k",
    22: "4k",
    25: "8k",
    28: "16k",
  };
  const BAND_LABELS = Object.entries(LABELLED).map(([index, text]) => ({
    text,
    left: ((Number(index) + 0.5) / BAND_COUNT) * 100,
  }));
  const CHANNELS = [0, 1] as const;
  const TAGS = ["L", "R"] as const;

  const playback = getPlayback();
  const settings = getSettings();

  let layout = $state<"wide" | "narrow">("wide");
  const narrow = $derived(layout === "narrow");
  const calm = $derived(settings.calmMotion === true);
  let visible = $state(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const active = $derived(!calm && visible);

  // A hidden or minimized window stops the feed and the loop; coming back resumes them.
  $effect(() => {
    const sync = () => (visible = document.visibilityState === "visible");
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  });

  const feed = createMeterFeed(() => active);

  const floorText = formatHeldPeak(BALLISTICS.floorDb);
  let readouts = $state<[string, string]>([floorText, floorText]);
  let clips = $state<[boolean, boolean]>([false, false]);

  type Surface = { ctx: CanvasRenderingContext2D; w: number; h: number; node: HTMLCanvasElement };
  const surfaces: { spectrum: Surface | null; left: Surface | null; right: Surface | null } = {
    spectrum: null,
    left: null,
    right: null,
  };
  let display: DisplayState = initialDisplay();
  let color = "";

  function isAtRest(state: DisplayState): boolean {
    const floor = BALLISTICS.floorDb;
    const resting = (bar: { level: number; cap: number }) => bar.level <= floor && bar.cap <= floor;
    return (
      state.bands.every(resting) &&
      resting(state.peak[0]) &&
      resting(state.peak[1]) &&
      state.rms[0] <= floor &&
      state.rms[1] <= floor &&
      !state.clip[0] &&
      !state.clip[1]
    );
  }

  function drawAll(ink: string) {
    const { spectrum, left, right } = surfaces;
    if (spectrum) drawSpectrum(spectrum.ctx, spectrum.w, spectrum.h, ink, display.bands);
    if (left) drawLevel(left.ctx, left.w, left.h, ink, display.peak[0], display.rms[0]);
    if (right) drawLevel(right.ctx, right.w, right.h, ink, display.peak[1], display.rms[1]);
  }

  function refreshReadouts() {
    readouts = [formatHeldPeak(display.peak[0].cap), formatHeldPeak(display.peak[1].cap)];
    clips = [display.clip[0], display.clip[1]];
  }

  function clear(channel: 0 | 1) {
    display = clearClip(display, channel);
    refreshReadouts();
  }

  const fit =
    (key: "spectrum" | "left" | "right"): Attachment<HTMLCanvasElement> =>
    (node) => {
      const refit = () => {
        const ratio = window.devicePixelRatio || 1;
        const w = node.clientWidth;
        const h = node.clientHeight;
        node.width = Math.max(1, Math.round(w * ratio));
        node.height = Math.max(1, Math.round(h * ratio));
        const ctx = node.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        surfaces[key] = { ctx, w, h, node };
        // Resizing clears the canvas: put the current state back.
        drawAll(color || getComputedStyle(node).color);
      };
      const observer = new ResizeObserver(refit);
      observer.observe(node);
      refit();
      return () => {
        observer.disconnect();
        surfaces[key] = null;
      };
    };

  const observeLayout: Attachment<HTMLElement> = (node) => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) layout = entry.contentRect.width < NARROW_BELOW_PX ? "narrow" : "wide";
    });
    observer.observe(node);
    return () => observer.disconnect();
  };

  $effect(() => {
    if (!active) return;
    display = initialDisplay();
    refreshReadouts();
    const probe = surfaces.spectrum?.node ?? null;
    color = probe ? getComputedStyle(probe).color : color;
    let last: number | null = null;
    let drawnAtRest = false;
    let frameId = 0;

    const tick = (now: number) => {
      const elapsed = last === null ? 0 : (now - last) / 1000;
      last = now;
      const input =
        playback.status === "playing" ? reduceFrames(feed.drain()) : (feed.drain(), null);
      display = stepDisplay(display, input, elapsed);
      const atRest = isAtRest(display);
      if (!(atRest && drawnAtRest)) {
        drawAll(color);
        drawnAtRest = atRest;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    const interval = setInterval(refreshReadouts, READOUT_MS);

    return () => {
      cancelAnimationFrame(frameId);
      clearInterval(interval);
      display = initialDisplay();
      refreshReadouts();
      drawAll(color || (probe ? getComputedStyle(probe).color : ""));
    };
  });
</script>

{#snippet readout(channel: 0 | 1)}
  {#if calm}
    <span
      class={cn(
        "self-center justify-self-start px-1 text-sm leading-[1.375rem] tabular-nums text-muted-foreground",
        narrow ? "order-3" : "",
      )}
    >
      {floorText}
    </span>
  {:else if clips[channel]}
    <span class={cn("self-center justify-self-start", narrow && "order-3")}>
      <Button
        type="button"
        onclick={() => clear(channel)}
        purpose="primary"
        density="inline"
        geometry="clip"
        typeRole="label"
      >
        Clip
      </Button>
    </span>
  {:else}
    <span
      class={cn(
        "self-center justify-self-start px-1 text-sm leading-[1.375rem] tabular-nums text-muted-foreground",
        narrow && "order-3",
      )}
    >
      {readouts[channel]}
    </span>
  {/if}
{/snippet}

<section
  {@attach observeLayout}
  aria-label="Meters"
  data-layout={layout}
  class={cn(
    "grid h-full min-h-0 min-w-0 gap-x-2 tabular-nums",
    narrow
      ? "grid-cols-1 grid-rows-[minmax(0,1fr)_auto_auto] gap-y-2"
      : "grid-cols-[2.5rem_3.5rem_3.5rem_minmax(0,1fr)]",
    className,
  )}
>
  {#if !narrow}
    <div class="grid min-h-0 grid-rows-[1.75rem_minmax(0,1fr)_1.75rem]" aria-hidden="true">
      <span></span>
      <div class="relative min-h-0">
        {#each AXIS_TICKS as db (db)}
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
        narrow
          ? "h-10 grid-cols-[1.5rem_minmax(0,1fr)_4.5rem]"
          : "grid-rows-[1.75rem_minmax(0,1fr)_1.75rem]",
        narrow && (channel === 0 ? "order-2" : "order-3"),
      )}
    >
      {@render readout(channel)}
      <div class={cn("relative min-h-0", narrow && "order-2")}>
        <canvas
          {@attach fit(channel === 0 ? "left" : "right")}
          aria-hidden="true"
          class={cn("absolute inset-0 block size-full text-foreground", calm && "opacity-25")}
        ></canvas>
      </div>
      <span
        class={cn(
          "self-center justify-self-start text-sm text-muted-foreground",
          narrow && "order-1",
        )}
      >
        {TAGS[channel]}
      </span>
    </div>
  {/each}

  <div
    class={cn(
      "grid min-h-0",
      narrow
        ? "order-1 grid-rows-[minmax(0,1fr)_1.75rem]"
        : "ml-6 grid-rows-[1.75rem_minmax(0,1fr)_1.75rem]",
    )}
  >
    {#if !narrow}
      <span></span>
    {/if}
    <div class="relative min-h-0">
      <canvas
        {@attach fit("spectrum")}
        aria-hidden="true"
        class={cn("absolute inset-0 block size-full text-foreground", calm && "opacity-25")}
      ></canvas>
      {#if calm}
        <p
          role="status"
          class="absolute inset-0 grid place-items-center p-4 text-center text-muted-foreground"
        >
          Calm motion is on, so the meters are stopped.
        </p>
      {/if}
    </div>
    <div class="relative" aria-hidden="true">
      {#each BAND_LABELS as label (label.text)}
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
