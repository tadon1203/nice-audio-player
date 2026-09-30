import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { AudioOutputSelection } from "@/shared/ipc";
import { useLibraryTrack } from "@/entities/library";
import {
  describeSignalPath,
  snapshotSession,
  usePlaybackStore,
  type PlaybackSignalPath,
} from "@/entities/playback";
import { formatAudioPath } from "@/shared/lib/format";

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
