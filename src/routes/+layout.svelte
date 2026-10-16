<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { applyCssMotion } from "#lib/ui/motion/css-motion";
  import { QueryClientProvider } from "@tanstack/svelte-query";
  import ArtworkAccent from "./artwork-accent.svelte";
  import PlaybackRegion from "#lib/components/dock/playback-region.svelte";
  import LyricsPrefetch from "#lib/components/now-playing/lyrics-prefetch.svelte";
  import NowPlayingContent from "#lib/components/now-playing/now-playing-content.svelte";
  import NowPlayingLayer from "#lib/components/now-playing/now-playing-layer.svelte";
  import QueuePanel from "#lib/components/queue-panel/queue-panel.svelte";
  import { setLibraryScan } from "#lib/library/context";
  import { AppServices } from "#lib/shell/app-services.svelte";
  import { nowPlaying } from "#lib/shell/now-playing.svelte";
  import { handlePlaybackShortcut } from "#lib/shell/playback-shortcuts";
  import { TooltipProvider } from "#lib/ui/shadcn/tooltip";
  import Navigation from "./navigation.svelte";
  import TitleBar from "./title-bar.svelte";

  let { children } = $props();

  // Created once: the native bridge never changes while the renderer lives. Null without the bridge.
  const services = AppServices.tryCreate();
  if (services !== null) setLibraryScan(services.libraryScan);

  // The UI does not wait for the connection: the Dock shows its state, the rest fills in as it arrives.
  onMount(() => services?.session.connect());

  $effect(() => applyCssMotion(document.documentElement, prefersReducedMotion.current));
</script>

<svelte:window
  onkeydown={(event) => services && handlePlaybackShortcut(event, services.playback)}
/>

{#if services === null}
  <div class="flex h-full items-center justify-center bg-background p-8">
    <p role="alert" class="max-w-md text-center text-lg text-foreground">
      Native bridge unavailable
    </p>
  </div>
{:else}
  <QueryClientProvider client={services.queryClient}>
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
