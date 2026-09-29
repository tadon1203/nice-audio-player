import { useReducedMotion } from "motion/react";
import {
  usePlaybackItem,
  usePlaybackNavigation,
  usePlaybackPosition,
  usePlaybackTransport,
  usePlaybackWaveform,
} from "@/renderer/entities/playback";
import { useLoudnessLevel } from "@/renderer/features/now-playing-transition";
import { ArtworkLight } from "@/renderer/shared/ui/artwork-light";
import { useInterpolatedPosition } from "@/renderer/shared/ui/motion";

/**
 * Now Playing's Light, which breathes with the track's loudness (never brighter than its
 * strength). It reads the position itself, so the rest of the layer does not re-render with
 * time. The breathing is off under reduced motion.
 */
export function NowPlayingLight() {
  const item = usePlaybackItem();
  const navigation = usePlaybackNavigation();
  const { positionMs, durationMs } = usePlaybackPosition();
  const playing = usePlaybackTransport().status === "playing";
  const reduced = useReducedMotion() === true;
  const peaks = usePlaybackWaveform(item?.file.path ?? null)?.peaks ?? null;
  const position = useInterpolatedPosition({ positionMs, durationMs, playing });
  const level = useLoudnessLevel(peaks, position, durationMs, playing);

  return (
    <ArtworkLight
      artwork={item?.artwork ?? null}
      strength="max"
      enter={navigation === "previous" ? "wipe-previous" : "wipe-next"}
      level={reduced ? undefined : level}
    />
  );
}
