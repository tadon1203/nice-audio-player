import { Outlet, useRouterState } from "@tanstack/react-router";
import { LyricsWaveformLinkProvider } from "@/renderer/features/lyrics-waveform-link";
import { useNowPlaying } from "@/renderer/features/now-playing-transition";
import { NowPlayingContent, NowPlayingLayer } from "@/renderer/widgets/now-playing";
import { PlaybackRegion } from "@/renderer/widgets/playback-region";
import { QueuePanel } from "@/renderer/widgets/queue-panel";
import { Navigation } from "./navigation";
import { TitleBar } from "./title-bar";
import { usePlaybackShortcuts } from "./use-playback-shortcuts";

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { isOpen: nowPlayingOpen } = useNowPlaying();
  usePlaybackShortcuts();

  return (
    <LyricsWaveformLinkProvider>
      <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[40px_minmax(0,1fr)_auto] bg-background md:grid-cols-[16rem_minmax(0,1fr)]">
        <TitleBar pathname={pathname} />

        <aside
          inert={nowPlayingOpen}
          className="col-start-1 row-start-2 hidden min-h-0 w-64 bg-sidebar text-sidebar-foreground md:flex"
        >
          <Navigation pathname={pathname} />
        </aside>

        <main
          inert={nowPlayingOpen}
          className="col-start-1 row-start-2 min-h-0 min-w-0 overflow-hidden md:col-start-2"
          data-slot="app-main"
        >
          <Outlet />
        </main>

        <NowPlayingLayer>
          <NowPlayingContent />
        </NowPlayingLayer>

        <div className="col-span-full row-start-3 min-h-0 min-w-0">
          <PlaybackRegion />
        </div>

        <QueuePanel />
      </div>
    </LyricsWaveformLinkProvider>
  );
}
