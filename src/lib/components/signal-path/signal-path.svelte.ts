import { AudioFormatText } from "#lib/utils/audio-format-text";
import { useApp } from "#lib/app/app.svelte";
import {
  PlaybackTechnicalStatus,
  type PlaybackSignalPath,
} from "#lib/player/playback-technical-status";
import { PlaybackSnapshots } from "#lib/player/playback-snapshots";

/**
 * The signal path of the loaded track, or null when nothing is loaded. Construct it during
 * component initialization; read `current` where it is shown.
 */
export class SignalPath {
  readonly #playback = useApp().player;
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
        outputName: session.outputDeviceName,
      },
      this.#playback.snapshot?.base.outputSelection ?? null,
    );
  });

  public get current(): PlaybackSignalPath | null {
    return this.#current;
  }
}
