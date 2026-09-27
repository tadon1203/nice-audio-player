import { useShallow } from "zustand/react/shallow";
import type { AudioOutputSelection } from "@/shared/ipc";
import { useLibraryTrackForPath } from "@/renderer/entities/library";
import { formatAudioPath, formatKilohertz } from "@/renderer/shared/lib/format";
import { isActivePlayback, usePlaybackStore } from "./playback-session";

/** The dock's signal path: `source › processing › output`. `processing` is null when bit-perfect. */
export type PlaybackSignalPath = {
  readonly source: string;
  readonly processing: string | null;
  readonly output: string;
  readonly selection: AudioOutputSelection | null;
};

type SignalFacts = {
  sourceLabel: string;
  resamplingActive: boolean;
  outputSampleRate: number | null;
  channelConversion: "none" | "monoToStereo" | "stereoToMono" | null;
  outputName: string | null;
};

export function describeSignalPath(
  facts: SignalFacts,
  selection: AudioOutputSelection | null = null,
): PlaybackSignalPath {
  const steps: string[] = [];
  if (facts.resamplingActive) steps.push(`${formatKilohertz(facts.outputSampleRate)} kHz`);
  if (facts.channelConversion === "monoToStereo") steps.push("mono to stereo");
  if (facts.channelConversion === "stereoToMono") steps.push("stereo to mono");
  return {
    source: facts.sourceLabel,
    processing: steps.length > 0 ? steps.join(", ") : null,
    output: facts.outputName || "Output",
    selection,
  };
}

export function usePlaybackSignalPath(): PlaybackSignalPath | null {
  const technical = usePlaybackStore(
    useShallow((state) => {
      const snapshot = state.snapshot;
      const active = isActivePlayback(snapshot);
      return {
        active,
        path: snapshot?.file?.path ?? null,
        extension: snapshot?.file?.extension ?? null,
        sourceSampleRate: active ? snapshot.sourceSampleRate : null,
        outputSampleRate: active ? snapshot.outputSampleRate : null,
        outputDeviceName: active ? snapshot.outputDevice.name : null,
        channelConversion: active ? snapshot.channelConversion : null,
        resamplingActive: active ? snapshot.resamplingActive : false,
        selection: snapshot?.outputSelection ?? null,
      };
    }),
  );
  const track = useLibraryTrackForPath(technical.path).data ?? null;
  if (!technical.active) return null;

  return describeSignalPath(
    {
      sourceLabel: formatAudioPath({
        format: track?.fileFormat ?? technical.extension,
        bitDepth: track?.bitDepth,
        sampleRate: technical.sourceSampleRate,
        bitrateKbps: track?.bitrateKbps,
      }),
      resamplingActive: technical.resamplingActive,
      outputSampleRate: technical.outputSampleRate,
      channelConversion: technical.channelConversion,
      outputName: technical.outputDeviceName,
    },
    technical.selection,
  );
}
