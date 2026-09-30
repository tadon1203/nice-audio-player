import { m } from "motion/react";
import { usePlaybackItem, usePlaybackNavigation } from "@/renderer/entities/playback";
import { ArtworkLight } from "@/renderer/shared/ui/artwork-light";
import { DockIdentity } from "./dock-identity";
import { DockTransport } from "./dock-transport";
import { DockVolume } from "./dock-volume";
import {
  DOCK_SEEK_HEIGHT,
  PlaybackWaveformBand,
  useNowPlaying,
  useNowPlayingTransitions,
} from "@/renderer/features/now-playing-transition";

/**
 * Two full-width rows: a plain progress line across the top, then identity, transport and volume.
 * The transport grid's side columns are equal, so the transport sits on the dock's true centre
 * whatever the two sides hold.
 */
export function PlaybackDock() {
  // Nothing read here changes with playback position, so the dock does not re-render as time
  // passes.
  const item = usePlaybackItem();
  const navigation = usePlaybackNavigation();
  const trackKey = item?.file.path ?? "none";
  const { isOpen: nowPlayingOpen } = useNowPlaying();
  const transitions = useNowPlayingTransitions();

  return (
    <footer
      className="relative isolate h-full min-h-0 bg-sidebar shadow-[inset_0_1px_0_var(--border)]"
      aria-label="Playback controls"
      data-slot="playback-dock"
    >
      <ArtworkLight
        artwork={item?.artwork ?? null}
        strength="strong"
        enter={navigation === "previous" ? "wipe-previous" : "wipe-next"}
        className="mask-[linear-gradient(to_right,black,transparent_85%)]"
      />
      {/* A real vertical stack, not an overlay: each row consumes its own height, and the
          transport row is pinned to the bottom so it never moves. */}
      <div className="relative flex h-full min-h-0 min-w-0 flex-col justify-end pb-3">
        {/* While Now Playing is open the waveform lives up there, so this slot animates shut. */}
        <m.div
          initial={false}
          animate={{
            height: nowPlayingOpen ? 0 : 12,
            marginBottom: nowPlayingOpen ? 0 : 12,
          }}
          transition={nowPlayingOpen ? transitions.open : transitions.close}
          className="shrink-0 overflow-hidden"
        >
          {nowPlayingOpen ? null : (
            <PlaybackWaveformBand
              height={DOCK_SEEK_HEIGHT}
              showWaveform={false}
              timeLayout="inline"
              className="px-2 md:px-4 lg:px-6"
              timeClassName="hidden md:inline"
            />
          )}
        </m.div>

        <div
          className="grid min-h-16 min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 px-2 md:px-4 lg:gap-x-6 lg:px-6"
          data-region="playback-main"
        >
          <DockIdentity item={item} trackKey={trackKey} />
          <DockTransport />
          <DockVolume />
        </div>
      </div>
    </footer>
  );
}
