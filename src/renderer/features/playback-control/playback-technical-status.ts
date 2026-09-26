import { useShallow } from "zustand/react/shallow";
import { formatSampleRate } from "@/renderer/shared/lib/format";
import { isActivePlayback, usePlaybackStore } from "./playback-session";

export type PlaybackStatusLine = {
  readonly label: "SOURCE" | "SRC" | "OUTPUT";
  readonly value: string;
};

export function usePlaybackTechnicalStatus(): readonly PlaybackStatusLine[] {
  const technical = usePlaybackStore(
    useShallow((state) => {
      const snapshot = state.snapshot;
      const active = isActivePlayback(snapshot);
      return {
        active,
        extension: snapshot?.file?.extension ?? null,
        sourceSampleRate: active ? snapshot.sourceSampleRate : null,
        outputSampleRate: active ? snapshot.outputSampleRate : null,
        outputDeviceName: active ? snapshot.outputDevice.name : null,
        channelConversion: active ? snapshot.channelConversion : null,
        resamplingActive: active ? snapshot.resamplingActive : false,
      };
    }),
  );

  const sourceRate = technical.active ? formatSampleRate(technical.sourceSampleRate) : "—";
  const outputRate = technical.active ? formatSampleRate(technical.outputSampleRate) : "—";
  const conversion = technical.active
    ? technical.channelConversion === "monoToStereo"
      ? "mono → stereo"
      : technical.channelConversion === "stereoToMono"
        ? "stereo → mono"
        : "direct"
    : "—";

  return [
    {
      label: "SOURCE",
      value: `${technical.extension?.toUpperCase() ?? "—"} · ${sourceRate}`,
    },
    {
      label: "SRC",
      value: technical.active
        ? `${sourceRate} → ${outputRate} · ${technical.resamplingActive ? "resampling" : "direct"}`
        : "—",
    },
    {
      label: "OUTPUT",
      value: technical.active
        ? `${technical.outputDeviceName || "—"} · ${conversion} · ${outputRate}`
        : "—",
    },
  ] as const;
}
