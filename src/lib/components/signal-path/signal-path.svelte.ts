import { useApp } from "#lib/app/app.svelte";
import type { AudioOutputSelection, PlaybackChannelConversion } from "#lib/native/bindings";
import type { SignalPathFacts } from "#lib/player/player.svelte";
import { AudioFormatText } from "#lib/utils/audio-format-text";

/** The dock's signal path: `source › processing › output`. `processing` is null when bit-perfect. */
export interface PlaybackSignalPath {
  readonly source: string;
  readonly processing: string | null;
  readonly output: string;
  readonly selection: AudioOutputSelection;
}

/** The step text of each channel conversion. "none" adds no step. */
const CHANNEL_STEPS: Partial<Record<PlaybackChannelConversion, string>> = {
  monoToStereo: "mono to stereo",
  stereoToMono: "stereo to mono",
  downmix: "surround downmix",
};

/** Describes the signal path from its facts. Pure: the facts in, the path out. */
export function describeSignalPath(facts: SignalPathFacts): PlaybackSignalPath {
  const steps = [
    facts.resamplingActive ? `${AudioFormatText.kilohertz(facts.outputSampleRate)} kHz` : undefined,
    facts.channelConversion ? CHANNEL_STEPS[facts.channelConversion] : undefined,
  ].filter((step): step is string => step !== undefined);
  return {
    source: facts.sourceLabel,
    processing: steps.length > 0 ? steps.join(", ") : null,
    output: facts.outputName || "Output",
    selection: facts.selection,
  };
}

/**
 * The signal path of the loaded track, or null when nothing is loaded. Construct it during
 * component initialization; read `current` where it is shown.
 */
export class SignalPath {
  readonly #playback = useApp().player;

  public get current(): PlaybackSignalPath | null {
    const facts = this.#playback.signalPath;
    return facts === null ? null : describeSignalPath(facts);
  }
}
