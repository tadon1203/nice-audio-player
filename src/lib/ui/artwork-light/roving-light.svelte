<script lang="ts" module>
  import type { ArtworkRef } from "$lib/native";

  export type RovingTarget = {
    artwork: ArtworkRef | null;
    /** Centre of the hovered tile, relative to the light's container. */
    x: number;
    y: number;
    /** False once the pointer has left the grid: the light fades away. */
    active: boolean;
  };

  const SIZE_PX = 448;
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import { Tween } from "svelte/motion";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import ArtworkLight from "./artwork-light.svelte";

  /**
   * A single faint Light behind a grid that follows the hovered or focused tile (eased, not a
   * jump) and takes that tile's artwork (crossfading, like any Light). It fades away when the
   * pointer leaves. Mount it once there is a target; it starts invisible at the first tile.
   * Place it first inside a `relative` container, under the grid.
   */
  let { target }: { target: RovingTarget } = $props();

  const x = new Tween(untrack(() => target.x - SIZE_PX / 2));
  const y = new Tween(untrack(() => target.y - SIZE_PX / 2));
  const opacity = new Tween(0);

  $effect(() => {
    const goal = { x: target.x - SIZE_PX / 2, y: target.y - SIZE_PX / 2 };
    const move = motionFor("move");
    untrack(() => {
      void x.set(goal.x, move);
      void y.set(goal.y, move);
    });
  });

  $effect(() => {
    const goal = target.active ? 1 : 0;
    const light = motionFor("large");
    untrack(() => void opacity.set(goal, light));
  });
</script>

<div
  aria-hidden="true"
  data-slot="roving-light"
  class="pointer-events-none absolute top-0 left-0 mask-[radial-gradient(closest-side,black,transparent)]"
  style:width="{SIZE_PX}px"
  style:height="{SIZE_PX}px"
  style:transform="translate({x.current}px, {y.current}px)"
  style:opacity={opacity.current}
>
  <ArtworkLight artwork={target.artwork} strength="faint" />
</div>
