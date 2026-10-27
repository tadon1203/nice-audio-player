<script lang="ts" module>
  /** How a new image arrives: faded in, or wiped in from the right (`wipe-next`) or left. */
  export type GlowEnter = "fade" | "wipe-next" | "wipe-previous";
</script>

<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import { prefersReducedMotion } from "svelte/motion";
  import { fade, type TransitionConfig } from "svelte/transition";
  import { type ArtworkRef } from "#lib/native/bindings";
  import { ArtworkUrl } from "#lib/native/artwork-url";
  import { SvelteMotion } from "#lib/components/ui/motion/svelte-motion";
  import { cn } from "#lib/utils/cn.js";
  import { GLOW, type GlowStrength } from "./glow";

  /**
   * The artwork as the app's light source: a static blurred image under a veil. Place it as the
   * first child of a `relative` surface; it never receives pointer events. It renders nothing
   * without artwork, and is hidden under `forced-colors` by CSS. Changing artwork crossfades
   * (light is not an object), or wipes with the track direction (`enter`) while the old image
   * stays put until covered. With a `breathe` attachment it breathes: only its opacity moves,
   * straight on the element (a scaled blurred image would be re-rasterised on every frame), as a
   * share of its strength, so it only ever dims. The breathing wrapper is promoted with `will-change: opacity`, so the
   * blurred raster is cached and only its opacity is composited per frame; a still Artwork glow gets
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
    strength: GlowStrength;
    /** Wipes need motion: under reduced motion every `enter` fades. */
    enter?: GlowEnter;
    /** Moves the breathing wrapper's opacity. Omit it for a still Artwork glow. */
    breathe?: Attachment<HTMLElement>;
    class?: string;
  } = $props();

  const url = $derived(ArtworkUrl.of(artwork, "thumb"));
  const motion = $derived(SvelteMotion.of("large"));
  const wipeMotion = $derived(SvelteMotion.of("move"));
  const wipe = $derived(!prefersReducedMotion.current && enter !== "fade" ? enter : null);

  /** The incoming image: faded in, or clipped so that it grows from the edge it came from. */
  function arrive(node: Element): TransitionConfig {
    if (wipe === null) return fade(node, motion);
    const from = wipe;
    return {
      ...wipeMotion,
      css: (_t: number, u: number): string =>
        from === "wipe-previous"
          ? `clip-path: inset(0 ${u * 100}% 0 0)`
          : `clip-path: inset(0 0 0 ${u * 100}%)`,
    };
  }

  /** The outgoing image fades, or (under a wipe) stays until the new one has covered it (the wipe's own length). */
  function leave(node: Element): TransitionConfig {
    return wipe === null ? fade(node, motion) : { delay: wipeMotion.duration, duration: 0 };
  }
</script>

{#if url !== null}
  <div
    aria-hidden="true"
    data-slot="artwork-glow"
    data-strength={strength}
    data-enter={enter}
    class={cn("artwork-glow pointer-events-none absolute inset-0 overflow-hidden", className)}
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
          style:opacity={GLOW.strength[strength]}
          style:filter="blur({GLOW.blurPx}px) brightness({GLOW.brightness})"
        />
      {/key}
    </div>
    <div class="absolute inset-0 bg-background" style:opacity={GLOW.veilOpacity}></div>
  </div>
{/if}
