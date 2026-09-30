<script lang="ts">
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
   * (light is not an object).
   */
  let {
    artwork,
    strength,
    class: className,
  }: {
    artwork: ArtworkRef | null | undefined;
    strength: LightStrength;
    class?: string;
  } = $props();

  const url = $derived(artworkUrl(artwork));
  const motion = $derived(motionFor("light", prefersReducedMotion.current));
</script>

{#if url !== null}
  <div
    aria-hidden="true"
    data-slot="artwork-light"
    data-strength={strength}
    class={cn("artwork-light pointer-events-none absolute inset-0 overflow-hidden", className)}
  >
    <div class="absolute inset-0">
      {#key url}
        <img
          src={url}
          alt=""
          in:fade={motion}
          out:fade={motion}
          class="absolute inset-0 size-full scale-125 object-cover"
          style:opacity={LIGHT.strength[strength]}
          style:filter="blur({LIGHT.blurPx}px) brightness({LIGHT.brightness})"
        />
      {/key}
    </div>
    <div class="absolute inset-0 bg-background" style:opacity={LIGHT.veilOpacity}></div>
  </div>
{/if}
