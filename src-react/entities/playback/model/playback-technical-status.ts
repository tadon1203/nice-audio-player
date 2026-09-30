import type { AudioOutputSelection } from "@/shared/ipc";
import { formatKilohertz } from "@/shared/lib/format";

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
