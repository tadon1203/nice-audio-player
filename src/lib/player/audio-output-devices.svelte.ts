import { type AudioOutputDevice } from "#lib/native/bindings";
import type { player } from "#lib/native/commands";

/**
 * The output devices the device menus offer. The list is read again each time a menu opens, so a
 * device plugged in since the last open is listed. Throws AudioDevicesError when the list fails.
 */
export class AudioOutputDevices {
  readonly #player: typeof player;
  #listed = $state.raw<AudioOutputDevice[]>([]);

  public constructor(playerCommands: typeof player) {
    this.#player = playerCommands;
  }

  /** The devices the last listing found; empty until a menu opens for the first time. */
  public get devices(): AudioOutputDevice[] {
    return this.#listed;
  }

  /** Reads the device list now. Throws AudioDevicesError on failure; the list then keeps its last value. */
  public async refresh(): Promise<void> {
    this.#listed = await this.#player.listOutputDevices();
  }
}
