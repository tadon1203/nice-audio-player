<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { QueryClientProvider } from "@tanstack/svelte-query";
  import { native } from "$lib/native";
  import { setPlayback } from "$lib/playback/context";
  import { createPlayback } from "$lib/playback/playback.svelte";
  import { setSettings } from "$lib/settings/context";
  import { createSettings } from "$lib/settings/settings.svelte";
  import { queryClient } from "$lib/shell/query-client";
  import { startNativeSession } from "$lib/shell/session";

  let { children } = $props();

  // Created once: the native bridge never changes while the renderer lives.
  const playback = native ? createPlayback(native) : null;
  const settings = native ? createSettings(native) : null;
  if (playback !== null && settings !== null) {
    setPlayback(playback);
    setSettings(settings);
  }

  onMount(() => {
    if (playback === null || settings === null) return;
    return startNativeSession({ playback, settings, queryClient });
  });
</script>

{#if playback === null}
  <p role="alert" class="p-8">Native bridge unavailable</p>
{:else}
  <QueryClientProvider client={queryClient}>
    {@render children()}
  </QueryClientProvider>
{/if}
