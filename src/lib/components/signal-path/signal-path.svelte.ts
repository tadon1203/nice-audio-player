import { formatAudioPath } from "$lib/utils/format";
import { getPlayback } from "$lib/playback/context";
import {
  describeSignalPath,
  type PlaybackSignalPath,
} from "$lib/playback/playback-technical-status";
import { snapshotSession } from "$lib/playback/snapshot";

/**
 * The signal path of the loaded track, or null when nothing is loaded. Call during component
 * initialization; read `current` where it is shown.
 */
export function createPlaybackSignalPath() {
  const playback = getPlayback();
  const session = $derived(snapshotSession(playback.snapshot));

  const current = $derived.by<PlaybackSignalPath | null>(() => {
    if (session === null) return null;
    return describeSignalPath(
      {
        sourceLabel: formatAudioPath({
          format: session.sourceFormat,
          bitDepth: session.sourceBitDepth,
          sampleRate: session.sourceSampleRate,
          bitrateKbps: session.sourceBitrateKbps,
        }),
        resamplingActive: session.resamplingActive,
        outputSampleRate: session.outputSampleRate,
        channelConversion: session.channelConversion,
        outputName: session.outputDevice.name,
      },
      playback.snapshot?.base.outputSelection ?? null,
    );
  });

  return {
    get current() {
      return current;
    },
  };
}
