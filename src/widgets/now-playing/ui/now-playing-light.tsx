import {
  usePlaybackItem,
  usePlaybackClock,
  usePlaybackDuration,
  usePlaybackNavigation,
  usePlaybackTransport,
  usePlaybackWaveform,
} from "@/entities/playback";
import { useLoudnessLevel } from "@/features/now-playing-transition";
import { ArtworkLight } from "@/shared/ui/artwork-light";
import { useArtworkBackdrop, useMotionBudget } from "@/entities/settings";

/**
 * Now Playing's Light, which breathes with the track's loudness (never brighter than its
 * strength). It follows the playback clock through motion values, so nothing re-renders with
 * time. The breathing is off under calm or reduced motion, and then nothing here runs per frame.
 */
export function NowPlayingLight() {
  const item = usePlaybackItem();
  const navigation = usePlaybackNavigation();
  const durationMs = usePlaybackDuration();
  const playing = usePlaybackTransport().status === "playing";
  // The Light breathes by itself, so only the full budget allows it.
  const backdrop = useArtworkBackdrop((state) => state.enabled);
  const reduced = useMotionBudget() !== "full";
  const rms = usePlaybackWaveform(item?.file.path ?? null)?.rms ?? null;
  const position = usePlaybackClock(!reduced);
  const level = useLoudnessLevel(rms, position, durationMs, playing, !reduced);

  if (!backdrop) return null;
  return (
    <ArtworkLight
      artwork={item?.artwork ?? null}
      strength="max"
      enter={navigation === "previous" ? "wipe-previous" : "wipe-next"}
      level={reduced ? undefined : level}
    />
  );
}
