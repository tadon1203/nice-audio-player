<script lang="ts" module>
  /** How a new image arrives: faded in, or wiped in from the right (`wipe-next`) or left. */
  export type LightEnter = "fade" | "wipe-next" | "wipe-previous";
</script>

<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import { prefersReducedMotion } from "svelte/motion";
  import { fade } from "svelte/transition";
  import { artworkUrl, type ArtworkRef } from "$lib/native";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import { cn } from "$lib/utils/cn.js";
  import { LIGHT, type LightStrength } from "./light-model";

  /**
   * The artwork as the app's light source: a static blurred image under a veil. Place it as the
   * first child of a `relative` surface; it never receives pointer events. It renders nothing
   * without artwork, and is hidden under `forced-colors` by CSS. Changing artwork crossfades
   * (light is not an object), or wipes with the track direction (`enter`) while the old image
   * stays put until covered. With a `breathe` attachment it breathes: only its opacity moves,
   * straight on the element (a scaled blurred image would be re-rasterised on every frame), as a
   * share of its strength, so it only ever dims. The breathing wrapper is promoted with `will-change: opacity`, so the
   * blurred raster is cached and only its opacity is composited per frame; a still Light gets
   * no such layer.
   */
  let {
    artwork,
    strength,
    enter = "fade",
    breathe,
    class: className,
  }: {
    artwork: ArtworkRef | null | undefined;
    strength: LightStrength;
    /** Wipes need motion: under reduced motion every `enter` fades. */
    enter?: LightEnter;
    /** Moves the breathing wrapper's opacity. Omit it for a still Light. */
    breathe?: Attachment<HTMLElement>;
    class?: string;
  } = $props();

  const url = $derived(artworkUrl(artwork, "thumb"));
  const motion = $derived(motionFor("large"));
  const wipeMotion = $derived(motionFor("move"));
  const wipe = $derived(!prefersReducedMotion.current && enter !== "fade" ? enter : null);

  /** The incoming image: faded in, or clipped so that it grows from the edge it came from. */
  function arrive(node: Element) {
    if (wipe === null) return fade(node, motion);
    const from = wipe;
    return {
      ...wipeMotion,
      css: (_t: number, u: number) =>
        from === "wipe-previous"
          ? `clip-path: inset(0 ${u * 100}% 0 0)`
          : `clip-path: inset(0 0 0 ${u * 100}%)`,
    };
  }

  /** The outgoing image fades, or (under a wipe) stays until the new one has covered it (the wipe's own length). */
  function leave(node: Element) {
    return wipe === null ? fade(node, motion) : { delay: wipeMotion.duration, duration: 0 };
  }
</script>

{#if url !== null}
  <div
    aria-hidden="true"
    data-slot="artwork-light"
    data-strength={strength}
    class={cn("artwork-light pointer-events-none absolute inset-0 overflow-hidden", className)}
  >
    <div
      {@attach breathe}
      class="absolute inset-0"
      style:will-change={breathe === undefined ? undefined : "opacity"}
    >
      {#key url}
        <img
          src={url}
          alt=""
          in:arrive
          out:leave
          class="absolute inset-0 size-full scale-125 object-cover"
          style:opacity={LIGHT.strength[strength]}
          style:filter="blur({LIGHT.blurPx}px) brightness({LIGHT.brightness})"
        />
      {/key}
    </div>
    <div class="absolute inset-0 bg-background" style:opacity={LIGHT.veilOpacity}></div>
  </div>
{/if}
