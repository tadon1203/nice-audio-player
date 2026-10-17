import { AudioFormatText } from "#lib/utils/audio-format-text";
import { AppServices } from "#lib/shell/app-services.svelte";
import {
  PlaybackTechnicalStatus,
  type PlaybackSignalPath,
} from "#lib/playback/playback-technical-status";
import { PlaybackSnapshots } from "#lib/playback/playback-snapshots";

/**
 * The signal path of the loaded track, or null when nothing is loaded. Construct it during
 * component initialization; read `current` where it is shown.
 */
export class SignalPath {
  readonly #playback = AppServices.current().playback;
  readonly #session = $derived(PlaybackSnapshots.session(this.#playback.snapshot));

  readonly #current = $derived.by<PlaybackSignalPath | null>(() => {
    const session = this.#session;
    if (session === null) return null;
    return PlaybackTechnicalStatus.describe(
      {
        sourceLabel: AudioFormatText.path({
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
      this.#playback.snapshot?.base.outputSelection ?? null,
    );
  });

  public get current(): PlaybackSignalPath | null {
    return this.#current;
  }
}
