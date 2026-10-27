<script lang="ts">
  import "../app.css";
  import { isTauri } from "#lib/native/desktop";
  import { prefersReducedMotion } from "svelte/motion";
  import { CssMotion } from "#lib/components/ui/motion/css-motion";
  import AppFrame from "#lib/components/layout/app-frame.svelte";

  let { children } = $props();

  // Checked once: the native bridge never changes while the renderer lives. Outside the desktop app
  // there is no Backend, so the App is not made and the unavailable screen shows.
  const tauri = isTauri();

  $effect(() => CssMotion.apply(document.documentElement, prefersReducedMotion.current));
</script>

{#if tauri}
  <AppFrame>{@render children()}</AppFrame>
{:else}
  <div class="flex h-full items-center justify-center bg-background p-8">
    <p role="alert" class="max-w-md text-center text-lg text-foreground">
      Native bridge unavailable
    </p>
  </div>
{/if}
