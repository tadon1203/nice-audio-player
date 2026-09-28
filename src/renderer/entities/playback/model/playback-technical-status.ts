import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { AudioOutputSelection } from "@/shared/ipc";
import { useLibraryTrack } from "@/renderer/entities/library";
import { formatAudioPath, formatKilohertz } from "@/renderer/shared/lib/format";
import { snapshotSession, usePlaybackStore } from "./playback-session";

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
  channelConversion: "none" | "monoToStereo" | "stereoToMono" | "downmix" | null;
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
  if (facts.channelConversion === "downmix") steps.push("surround downmix");
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
      const session = snapshotSession(state.snapshot);
      const selection = state.snapshot?.base.outputSelection ?? null;
      return {
        active: session !== null,
        trackId: session?.item.trackId ?? null,
        extension: session?.item.file.extension ?? null,
        sourceSampleRate: session?.sourceSampleRate ?? null,
        outputSampleRate: session?.outputSampleRate ?? null,
        outputDeviceName: session?.outputDevice.name ?? null,
        channelConversion: session?.channelConversion ?? null,
        resamplingActive: session?.resamplingActive ?? false,
        selectionDeviceId: selection?.kind === "device" ? selection.deviceId : null,
        hasSelection: selection !== null,
      };
    }),
  );
  const selection = useMemo<AudioOutputSelection | null>(
    () =>
      !technical.hasSelection
        ? null
        : technical.selectionDeviceId === null
          ? { kind: "systemDefault" }
          : { kind: "device", deviceId: technical.selectionDeviceId },
    [technical.hasSelection, technical.selectionDeviceId],
  );
  const track = useLibraryTrack(technical.trackId).data ?? null;
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
    selection,
  );
}
