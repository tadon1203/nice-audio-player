<script lang="ts" module>
  /** How a new image arrives: faded in, or wiped in from the right (`wipe-next`) or left. */
  export type LightEnter = "fade" | "wipe-next" | "wipe-previous";

  /** A number that tells subscribers when it changes (structurally, the playback clock's). */
  export type LightLevel = {
    get: () => number;
    subscribe: (listener: (value: number) => void) => () => void;
  };

  /** The old image only goes once the new one has covered it. */
  const WIPE_HOLD_MS = 300;
</script>

<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import { prefersReducedMotion } from "svelte/motion";
  import { fade } from "svelte/transition";
  import { artworkUrl, type ArtworkRef } from "$lib/native";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import { cn } from "$lib/utils/cn.js";
  import { breathingOpacity, LIGHT, type LightStrength } from "./light-model";

  /**
   * The artwork as the app's light source: a static blurred image under a veil. Place it as the
   * first child of a `relative` surface; it never receives pointer events. It renders nothing
   * without artwork, and is hidden under `forced-colors` by CSS. Changing artwork crossfades
   * (light is not an object), or wipes with the track direction (`enter`) while the old image
   * stays put until covered. With a `level` it breathes: only its opacity moves, straight on the
   * element (a scaled blurred image is re-rasterised on every frame), and only ever dims from
   * its strength.
   */
  let {
    artwork,
    strength,
    enter = "fade",
    level,
    class: className,
  }: {
    artwork: ArtworkRef | null | undefined;
    strength: LightStrength;
    /** Wipes need motion: under reduced motion every `enter` fades. */
    enter?: LightEnter;
    /** Loudness 0-1 for a Light that breathes with the music. Omit it for a still Light. */
    level?: LightLevel;
    class?: string;
  } = $props();

  const url = $derived(artworkUrl(artwork));
  const motion = $derived(motionFor("light", prefersReducedMotion.current));
  const wipeMotion = $derived(motionFor("mediumMove", prefersReducedMotion.current));
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

  /** The outgoing image fades, or (under a wipe) stays until the new one has covered it. */
  function leave(node: Element) {
    return wipe === null ? fade(node, motion) : { delay: WIPE_HOLD_MS, duration: 0 };
  }

  const breathe: Attachment<HTMLElement> = (node) => {
    if (level === undefined) return;
    const apply = (value: number) => {
      node.style.opacity = String(breathingOpacity(strength, value) / LIGHT.strength[strength]);
    };
    apply(level.get());
    const unsubscribe = level.subscribe(apply);
    return () => {
      unsubscribe();
      node.style.opacity = "";
    };
  };
</script>

{#if url !== null}
  <div
    aria-hidden="true"
    data-slot="artwork-light"
    data-strength={strength}
    class={cn("artwork-light pointer-events-none absolute inset-0 overflow-hidden", className)}
  >
    <div {@attach breathe} class="absolute inset-0">
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
