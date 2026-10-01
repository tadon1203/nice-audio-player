<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { QueryClientProvider } from "@tanstack/svelte-query";
  import ArtworkAccent from "$lib/components/dock/artwork-accent.svelte";
  import PlaybackRegion from "$lib/components/dock/playback-region.svelte";
  import LyricsPrefetch from "$lib/components/now-playing/lyrics-prefetch.svelte";
  import NowPlayingContent from "$lib/components/now-playing/now-playing-content.svelte";
  import NowPlayingLayer from "$lib/components/now-playing/now-playing-layer.svelte";
  import QueuePanel from "$lib/components/queue-panel/queue-panel.svelte";
  import { native } from "$lib/native";
  import { setPlayback } from "$lib/playback/context";
  import { createPlayback } from "$lib/playback/playback.svelte";
  import { setSettings } from "$lib/settings/context";
  import { createSettings } from "$lib/settings/settings.svelte";
  import { createMotionBudget, setMotionBudget } from "$lib/shell/motion-budget.svelte";
  import { nowPlaying } from "$lib/shell/now-playing.svelte";
  import { handlePlaybackShortcut } from "$lib/shell/playback-shortcuts";
  import { queryClient } from "$lib/shell/query-client";
  import { startNativeSession } from "$lib/shell/session";
  import { TooltipProvider } from "$lib/ui/shadcn/tooltip";
  import Navigation from "./navigation.svelte";
  import TitleBar from "./title-bar.svelte";

  let { children } = $props();

  // Created once: the native bridge never changes while the renderer lives.
  const playback = native ? createPlayback(native) : null;
  const settings = native ? createSettings(native) : null;
  if (playback !== null && settings !== null) {
    setPlayback(playback);
    setSettings(settings);
    setMotionBudget(createMotionBudget(settings));
  }

  onMount(() => {
    if (playback === null || settings === null) return;
    return startNativeSession({ playback, settings, queryClient });
  });
</script>

<svelte:window onkeydown={(event) => playback && handlePlaybackShortcut(event, playback)} />

{#if playback === null}
  <div class="flex h-full items-center justify-center bg-background p-8">
    <p role="alert" class="max-w-md text-center text-lg text-foreground">
      Native bridge unavailable
    </p>
  </div>
{:else}
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <div
        class="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[40px_minmax(0,1fr)_auto] bg-background md:grid-cols-[16rem_minmax(0,1fr)]"
      >
        <TitleBar />
        <aside
          inert={nowPlaying.isOpen}
          class="col-start-1 row-start-2 hidden min-h-0 min-w-0 flex-col bg-sidebar text-sidebar-foreground md:flex"
        >
          <Navigation />
        </aside>
        <main
          inert={nowPlaying.isOpen}
          class="col-start-1 row-start-2 min-h-0 min-w-0 md:col-start-2"
          data-slot="app-main"
        >
          {@render children()}
        </main>
        <NowPlayingLayer>
          <NowPlayingContent />
        </NowPlayingLayer>
        <div class="col-span-full row-start-3 min-h-0 min-w-0" data-slot="dock-region">
          <PlaybackRegion />
        </div>
        <QueuePanel />
        <ArtworkAccent />
        <LyricsPrefetch />
      </div>
    </TooltipProvider>
  </QueryClientProvider>
{/if}
