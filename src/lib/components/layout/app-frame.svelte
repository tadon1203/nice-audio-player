<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";
  import ArtworkAccent from "#lib/components/artwork-accent.svelte";
  import PlaybackRegion from "#lib/components/dock/playback-region.svelte";
  import NowPlayingContent from "#lib/components/now-playing/now-playing-content.svelte";
  import NowPlayingLayer from "#lib/components/now-playing/now-playing-layer.svelte";
  import QueuePanel from "#lib/components/queue-panel/queue-panel.svelte";
  import { App, setApp } from "#lib/app/app.svelte";
  import { handleShortcut } from "#lib/app/keyboard-shortcuts";
  import { Notices } from "#lib/app/user-actions.svelte";
  import * as native from "#lib/native/commands";
  import { TooltipProvider } from "#lib/components/ui/shadcn/tooltip";
  import Navigation from "./navigation.svelte";
  import TitleBar from "./title-bar.svelte";

  let { children }: { children: Snippet } = $props();

  // Made once. The layout checked the native bridge first. Components read the App with `useApp`.
  const app = setApp(
    new App(
      {
        app: native.app,
        appearance: native.appearance,
        library: native.library,
        lyrics: native.lyrics,
        player: native.player,
      },
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
      new Notices(),
    ),
  );

  // Fetches the lyrics of the playing track and the next one ahead of time. Now Playing then knows
  // whether there are any before it opens (its layout depends on it), and a track change does not
  // wait on the file. Each prefetch is a request, not state, so this stays an effect.
  $effect(() => {
    const { player, lyrics, queryClient } = app;
    const currentId = player.item?.id ?? null;
    const nextId = player.queue?.upcoming[0]?.id ?? null;
    for (const trackId of [currentId, nextId]) {
      if (trackId !== null) {
        void queryClient.query(lyrics.getTrack(trackId)).catch(() => undefined);
      }
    }
  });

  // The UI does not wait for the connection: the Dock shows its state, the rest fills in as it arrives.
  onMount(() => {
    void app.connection.connect();
  });
</script>

<svelte:window onkeydown={(event) => handleShortcut(event, app)} />

<QueryClientProvider client={app.queryClient}>
  <TooltipProvider>
    <div
      class="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[40px_minmax(0,1fr)_auto] bg-background md:grid-cols-[16rem_minmax(0,1fr)]"
    >
      <TitleBar />
      <aside
        inert={app.nowPlaying.isOpen}
        class="col-start-1 row-start-2 hidden min-h-0 min-w-0 flex-col bg-sidebar text-sidebar-foreground md:flex"
      >
        <Navigation />
      </aside>
      <main
        inert={app.nowPlaying.isOpen}
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
    </div>
  </TooltipProvider>
</QueryClientProvider>
