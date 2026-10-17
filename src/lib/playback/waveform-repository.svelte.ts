import {
  Replica,
  type PlaybackClient,
  type PlaybackId,
  type PlaybackWaveform,
  type Versioned,
} from "#lib/native";

/**
 * The Waveform of the loaded track. The backend pushes every Waveform it has (a quick approximation
 * and then the exact one), and `accept` keeps the newest. A Waveform is returned only for the
 * playback it belongs to, so a late answer is never drawn for another track.
 */
export class WaveformRepository {
  readonly #client: PlaybackClient;
  readonly #replica = new Replica<PlaybackWaveform | null>();
  // The playback the Backend was last asked about. Asking once per playback keeps reads cheap.
  #askedFor: PlaybackId | null = null;

  public constructor(client: PlaybackClient) {
    this.#client = client;
  }

  /** Keeps the Waveform if it is newer than the held one. Pushed states and the initial state come here. */
  public accept(incoming: Versioned<PlaybackWaveform | null>): void {
    this.#replica.accept(incoming);
  }

  /**
   * The Waveform of `playbackId`, or null while it is analyzed. Asks the Backend once for a
   * playback with no Waveform yet; the answer, or a later push, arrives through `accept`.
   */
  public forPlayback(playbackId: PlaybackId | null): PlaybackWaveform | null {
    if (playbackId === null) return null;
    const held = this.#replica.value;
    if (held?.playbackId === playbackId) return held;
    if (this.#askedFor !== playbackId) {
      this.#askedFor = playbackId;
      void this.#client.waveform().then(
        (answer) => this.accept(answer),
        () => undefined,
      );
    }
    return null;
  }
}
