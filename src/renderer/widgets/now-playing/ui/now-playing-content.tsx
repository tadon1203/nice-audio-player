import { m } from "motion/react";
import { usePlaybackSession } from "@/renderer/features/playback-control";
import { Artwork } from "@/renderer/shared/ui/artwork";
import { ArtworkLight } from "@/renderer/shared/ui/artwork-light";
import {
  NOW_PLAYING_WAVEFORM_HEIGHT,
  PlaybackWaveformBand,
} from "@/renderer/widgets/playback-region";
import { LyricsPanel } from "./lyrics-panel";

/**
 * Now Playing's content: the Sleeve and title continue their shared-element motion from the
 * dock (matching `layoutId`s in `playback-dock.tsx`), artist/album settle in around them, and
 * the lyrics panel takes the rest of the space. The waveform is the same object as the dock's,
 * grown into a hero band along the bottom edge (the dock hides its own copy while this is open
 * — see `PlaybackWaveformBand`), so it reads as one strip that grew, not a second instrument.
 * Layout stays fixed regardless of lyrics availability, so switching tracks never reflows it.
 */
export function NowPlayingContent() {
  const playback = usePlaybackSession();
  const isPlaying = playback.snapshot?.status === "playing";

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <ArtworkLight artwork={playback.artwork} strength="max" />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
        <div className="relative flex min-w-0 shrink-0 flex-col gap-4 p-6 md:w-96">
          <div className="flex items-center gap-4 md:flex-col md:items-start">
            <m.div
              layoutId="now-playing-sleeve"
              className="size-16 shrink-0 overflow-hidden rounded-lg md:size-[22rem]"
            >
              <Artwork
                artwork={playback.artwork}
                alt={playback.title === null ? "" : `${playback.title} artwork`}
                loading="eager"
                className="size-full rounded-none"
              />
            </m.div>
            <div className="min-w-0">
              <m.p
                layoutId="now-playing-title"
                className="truncate text-lg font-medium text-foreground"
              >
                {playback.title ?? "Nothing playing"}
              </m.p>
              {/* Ink-1: the playing track is "the present" per DESIGN.md, and Light may be absent. */}
              <m.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.12, duration: 0.18 }}
                className="truncate text-sm text-foreground"
              >
                {playback.artist}
              </m.p>
              <m.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.12, duration: 0.18 }}
                className="truncate text-sm text-foreground"
              >
                {playback.currentTrack?.album}
              </m.p>
            </div>
          </div>
        </div>
        <m.div
          key={playback.currentTrack?.id ?? "none"}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.2 }}
          className="min-h-0 min-w-0 flex-1 p-6 pt-0 md:pt-6"
        >
          <LyricsPanel
            trackId={playback.currentTrack?.id ?? null}
            positionMs={playback.positionMs}
            isPlaying={isPlaying}
            durationMs={playback.durationMs}
            onSeek={(value) => void playback.seek(value)}
            className="h-full"
          />
        </m.div>
      </div>
      <PlaybackWaveformBand
        height={NOW_PLAYING_WAVEFORM_HEIGHT}
        className="relative shrink-0 border-t border-border/50 px-6 py-4"
        timeClassName="text-sm"
      />
    </div>
  );
}
