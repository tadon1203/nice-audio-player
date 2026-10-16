import type { AudioOutputDevice, PlaybackClient } from "#lib/native";

/**
 * The output devices the device menus offer. The list is read again each time a menu opens, so a
 * device plugged in since the last open is listed. Throws AudioDevicesError when the list fails.
 */
export class AudioOutputDevices {
  readonly #client: PlaybackClient;
  #listed = $state.raw<AudioOutputDevice[]>([]);

  public constructor(client: PlaybackClient) {
    this.#client = client;
  }

  /** The devices the last listing found; empty until a menu opens for the first time. */
  public get devices(): AudioOutputDevice[] {
    return this.#listed;
  }

  /** Reads the device list now. Throws AudioDevicesError on failure; the list then keeps its last value. */
  public async refresh(): Promise<void> {
    this.#listed = await this.#client.listOutputDevices();
  }
}
