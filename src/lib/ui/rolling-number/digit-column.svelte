<script lang="ts">
  import { untrack } from "svelte";
  import { Tween } from "svelte/motion";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import { COLUMN_HOME_LAP, COLUMN_LAPS, rollTarget, type RollDirection } from "./rolling-model";

  let {
    digit,
    direction,
    spin,
    delay,
    instant,
  }: {
    digit: number;
    direction: RollDirection;
    spin: number;
    /** Seconds before the roll starts (the slot-machine stagger). */
    delay: number;
    instant: boolean;
  } = $props();

  /** Glyphs are drawn as CSS content, so the only text in the DOM is the real value. */
  const GLYPH = "before:content-[attr(data-glyph)]";
  const ROWS = Array.from({ length: COLUMN_LAPS * 10 }, (_, i) => i % 10);
  const HOME = COLUMN_HOME_LAP * 10;

  const position = new Tween(untrack(() => HOME + digit));
  let shown = untrack(() => digit);
  let generation = 0;

  // Only a new digit starts a roll. The other props are read when it starts, so a change of
  // direction or spin cannot cut a running roll short.
  $effect(() => {
    const next = digit;
    if (shown === next) return;
    shown = next;
    const {
      direction: way,
      spin: turns,
      delay: wait,
      instant: jump,
    } = untrack(() => ({
      direction,
      spin,
      delay,
      instant,
    }));
    const id = ++generation;
    if (jump) {
      void position.set(HOME + next, { duration: 0 });
      return;
    }
    // Every lap looks the same, so re-centre (keeping any fraction) to always have room to roll.
    void position.set(HOME + (position.current % 10), { duration: 0 });
    const motion = motionFor(turns > 0 ? "large" : "move");
    void position
      .set(rollTarget(position.current, next, way, turns), { ...motion, delay: wait * 1000 })
      .then(() => {
        if (id === generation) void position.set(HOME + next, { duration: 0 });
      });
  });
</script>

<span class="inline-block h-[1lh] overflow-clip">
  <span
    class="flex flex-col will-change-transform"
    style:transform="translateY({-position.current}lh)"
  >
    {#each ROWS as row, i (i)}
      <span data-glyph={row} class={GLYPH}></span>
    {/each}
  </span>
</span>
