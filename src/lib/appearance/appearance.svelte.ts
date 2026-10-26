import { type Appearance as AppearanceState, type AppearancePatch } from "#lib/native/bindings";
import type { appearance } from "#lib/native/commands";

/**
 * The Renderer's copy of the Appearance. The Backend pushes it whole when it changes, so a change
 * shows when its push arrives; `update` only sends the change.
 */
export class Appearance {
  readonly #appearance: typeof appearance;
  #shown = $state.raw<AppearanceState | null>(null);

  public constructor(appearanceCommands: typeof appearance) {
    this.#appearance = appearanceCommands;
  }

  /** Artwork glow behind the library and Now Playing; `null` until the appearance has loaded. */
  public get artworkBackdrop(): boolean | null {
    return this.#shown?.artworkBackdrop ?? null;
  }

  /** Only what marks the position moves by itself; `null` until the appearance has loaded. */
  public get calmMotion(): boolean | null {
    return this.#shown?.calmMotion ?? null;
  }

  /** Applies the Appearance the Backend pushed, from `connect` or a later change. */
  public accept(state: AppearanceState): void {
    this.#shown = state;
  }

  /** Sends `patch`; `null` fields stay as they are. The pushed Appearance shows the result. */
  public async update(patch: AppearancePatch): Promise<void> {
    await this.#appearance.update(patch);
  }
}
