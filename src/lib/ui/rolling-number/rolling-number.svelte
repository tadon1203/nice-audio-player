<script lang="ts">
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import { motionFor } from "$lib/ui/motion/svelte-motion";
  import { cn } from "$lib/utils/cn.js";
  import DigitColumn from "./digit-column.svelte";
  import { resolveDirection, settleDelay, type RollDirection } from "./rolling-model";

  /**
   * Digits that roll like an odometer. Columns are keyed by their place from the right, so a
   * length change keeps the lower places in the same DOM and only adds or removes the ends.
   * Non-digits (`:` `,` `−`) are static and fade in and out with the width. The moving parts are
   * `aria-hidden`; the value itself is real text for assistive tech and tests.
   */
  let {
    value,
    direction = "auto",
    spin = 0,
    settle = "together",
    instant = false,
    class: className,
  }: {
    value: string;
    direction?: RollDirection | "auto";
    /** Extra laps every changed digit turns (a seek, a count that jumps). */
    spin?: number;
    settle?: "together" | "right-last";
    /** Digits change without rolling: for a value that ticks on its own, where only a jump
     * (a seek) is worth showing. */
    instant?: boolean;
    class?: string;
  } = $props();

  const GLYPH = "before:content-[attr(data-glyph)]";
  const isDigit = (c: string) => c >= "0" && c <= "9";

  // The value before this one, to tell which way a number moved.
  let previous = untrack(() => value);
  const resolved = $derived<RollDirection>(
    direction === "auto" ? resolveDirection(previous, value) : direction,
  );
  $effect(() => {
    previous = value;
  });

  const cells = $derived(
    Array.from(value).map((char, index, chars) => {
      const place = chars.length - 1 - index;
      return { key: `${place}-${isDigit(char) ? "d" : "c"}`, char, place };
    }),
  );
  const reduced = $derived(prefersReducedMotion.current);
  const feedback = $derived(motionFor("feedback"));
</script>

<span class={cn("inline-flex", className)}>
  <span class="sr-only">{value}</span>
  <span aria-hidden="true" class="inline-flex">
    {#each cells as cell (cell.key)}
      <span
        class="inline-flex"
        in:fade={{ duration: feedback.duration }}
        out:fade={{ duration: feedback.duration }}
      >
        {#if !isDigit(cell.char)}
          <span data-glyph={cell.char} class={cn("whitespace-pre", GLYPH)}></span>
        {:else if reduced}
          <!-- Reduced motion: no rolling, the changed digit crossfades. -->
          <span class="inline-block h-[1lh] overflow-clip">
            {#key cell.char}
              <span
                data-glyph={cell.char}
                in:fade={{ duration: feedback.duration }}
                class={cn("block", GLYPH)}
              ></span>
            {/key}
          </span>
        {:else}
          <DigitColumn
            digit={Number(cell.char)}
            direction={resolved}
            {spin}
            delay={settleDelay(cell.place, settle)}
            {instant}
          />
        {/if}
      </span>
    {/each}
  </span>
</span>
