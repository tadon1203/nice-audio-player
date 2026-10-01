<script lang="ts" module>
  /** A fact that counts up from zero when the line first appears (after the shared-element move). */
  export type CountUpFact = { text: string; countUp: true };
  export type Fact = string | number | null | undefined | CountUpFact;
</script>

<script lang="ts">
  import { cn } from "$lib/utils/cn.js";
  import CountUpText from "./count-up-text.svelte";

  /** A line of facts (year, track count, time). Items are separated by space, not middle dots. */
  let {
    facts,
    fallback,
    class: className,
  }: {
    facts: readonly Fact[];
    /** Shown when no fact is available; the line is omitted without it. */
    fallback?: string;
    class?: string;
  } = $props();

  const present = $derived(
    facts.filter(
      (fact): fact is string | number | CountUpFact =>
        fact !== null && fact !== undefined && fact !== "",
    ),
  );
  const items = $derived(present.length > 0 ? present : fallback ? [fallback] : []);
</script>

{#if items.length > 0}
  <p class={cn("flex flex-wrap gap-x-4 text-sm tabular-nums text-muted-foreground", className)}>
    {#each items as item, index (index)}
      {#if typeof item === "object"}
        <CountUpText text={item.text} />
      {:else}
        <span>{item}</span>
      {/if}
    {/each}
  </p>
{/if}
