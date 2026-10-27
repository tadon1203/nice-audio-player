<script lang="ts">
  import { untrack } from "svelte";
  import { RollingMath, type RollDirection } from "./rolling-math";
  import { RollingColumn } from "./rolling-column.svelte";

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
  const ROWS = Array.from(
    { length: RollingMath.LAPS * RollingMath.LAP },
    (_, i) => i % RollingMath.LAP,
  );

  const column = new RollingColumn(untrack(() => digit));

  // A prop change is the only trigger here: no attachment or subscriber fits. Only a new digit
  // starts a roll; the other props are read when it starts, so a change of direction or spin cannot
  // cut a running roll short.
  $effect(() => {
    const next = digit;
    untrack(() => column.show(next, { direction, spin, delay, instant }));
  });
</script>

<span class="inline-block h-[1lh] overflow-clip">
  <span
    class="flex flex-col will-change-transform"
    style:transform="translateY({-column.position}lh)"
  >
    {#each ROWS as row, i (i)}
      <span data-glyph={row} class={GLYPH}></span>
    {/each}
  </span>
</span>
