<script lang="ts" module>
  import type { RovingTarget } from "./roving-target";

  const SIZE_PX = 448;
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import { Tween } from "svelte/motion";
  import { SvelteMotion } from "#lib/ui/motion/svelte-motion";
  import ArtworkGlow from "./artwork-glow.svelte";

  /**
   * A single faint Artwork glow behind a grid that follows the hovered or focused tile (eased, not a
   * jump) and takes that tile's artwork (crossfading, like any Artwork glow). It fades away when the
   * pointer leaves. Mount it once there is a target; it starts invisible at the first tile.
   * Place it first inside a `relative` container, under the grid.
   */
  let { target }: { target: RovingTarget } = $props();

  const x = new Tween(untrack(() => target.x - SIZE_PX / 2));
  const y = new Tween(untrack(() => target.y - SIZE_PX / 2));
  const opacity = new Tween(0);

  // Last resort: the hovered tile is a prop change, which starts an eased move.
  $effect(() => {
    const goal = { x: target.x - SIZE_PX / 2, y: target.y - SIZE_PX / 2 };
    const move = SvelteMotion.of("move");
    untrack(() => {
      void x.set(goal.x, move);
      void y.set(goal.y, move);
    });
  });

  // Last resort: the active flag is a prop change, which starts a fade.
  $effect(() => {
    const goal = target.active ? 1 : 0;
    const light = SvelteMotion.of("large");
    untrack(() => void opacity.set(goal, light));
  });
</script>

<div
  aria-hidden="true"
  data-slot="roving-glow"
  class="pointer-events-none absolute top-0 left-0 mask-[radial-gradient(closest-side,black,transparent)]"
  style:width="{SIZE_PX}px"
  style:height="{SIZE_PX}px"
  style:transform="translate({x.current}px, {y.current}px)"
  style:opacity={opacity.current}
>
  <ArtworkGlow artwork={target.artwork} strength="faint" />
</div>
