import { useShallow } from "zustand/react/shallow";
import { usePlaybackStore } from "./playback-session";

export type PlaybackStatusLine = {
  readonly label: "SOURCE" | "SRC" | "OUTPUT";
  readonly value: string;
};

const rate = (value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${(value / 1000).toFixed(1)} kHz`;

export function usePlaybackTechnicalStatus(): readonly PlaybackStatusLine[] {
  const technical = usePlaybackStore(
    useShallow((state) => {
      const snapshot = state.snapshot;
      const active = snapshot?.status === "playing" || snapshot?.status === "paused";
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

  const sourceRate = technical.active ? rate(technical.sourceSampleRate) : "—";
  const outputRate = technical.active ? rate(technical.outputSampleRate) : "—";
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
