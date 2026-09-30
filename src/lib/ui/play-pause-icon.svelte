<script lang="ts">
  import { untrack } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
  import { prefersReducedMotion, Tween } from "svelte/motion";
  import { motionFor } from "$lib/ui/motion/svelte-motion";

  // Both glyphs are two four-point shapes with the same vertex order (top-left, top-right,
  // bottom-right, bottom-left) so one becomes the other by interpolating the points.
  // Play is lucide's triangle cut at x = 13; pause is two bars. Each is [x, y] x 4, twice.
  const PLAY = [6, 3, 13, 7.5, 13, 16.5, 6, 21, 13, 7.5, 20, 12, 20, 12, 13, 16.5];
  const PAUSE = [6, 4, 9, 4, 9, 20, 6, 20, 15, 4, 18, 4, 18, 20, 15, 20];

  /**
   * The one play/pause glyph, so the play affordance looks the same everywhere. `playing` shows
   * the pause bars; a change morphs.
   */
  let { playing, ...props }: { playing: boolean } & SVGAttributes<SVGSVGElement> = $props();

  const points = new Tween(untrack(() => (playing ? PAUSE : PLAY)));
  $effect(() => {
    const goal = playing ? PAUSE : PLAY;
    const motion = motionFor("smallMove", prefersReducedMotion.current);
    untrack(() => void points.set(goal, motion));
  });

  const shapes = $derived.by(() => {
    const p = points.current;
    return [0, 8].map(
      (at) =>
        `M${p[at]} ${p[at + 1]}L${p[at + 2]} ${p[at + 3]}L${p[at + 4]} ${p[at + 5]}L${p[at + 6]} ${p[at + 7]}Z`,
    );
  });
</script>

<svg
  aria-hidden="true"
  viewBox="0 0 24 24"
  width="24"
  height="24"
  fill="currentColor"
  stroke="currentColor"
  stroke-width="2"
  stroke-linejoin="round"
  {...props}
>
  {#each shapes as d, i (i)}
    <path {d} />
  {/each}
</svg>
