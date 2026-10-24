import { Replica } from "#lib/native/replica.svelte";
import {
  type Appearance as AppearanceState,
  type AppearancePatch,
  type Revisioned,
} from "#lib/native/bindings";
import type { appearance } from "#lib/native/commands";

/**
 * The Renderer's copy of the Appearance. Changes apply at once; a failed save rolls back. The
 * saved value sits in a replica, and the value of a save still in flight sits on top of it.
 */
export class Appearance {
  readonly #appearance: typeof appearance;
  readonly #replica = new Replica<AppearanceState>();
  // The value of the save in flight; `null` when none is. The backend owns the defaults.
  #optimistic = $state.raw<AppearanceState | null>(null);

  public constructor(appearanceCommands: typeof appearance) {
    this.#appearance = appearanceCommands;
  }

  /** Artwork glow behind the library and Now Playing; `null` until the appearance has loaded. */
  public get artworkBackdrop(): boolean | null {
    return this.#shown()?.artworkBackdrop ?? null;
  }

  /** Only what marks the position moves by itself; `null` until the appearance has loaded. */
  public get calmMotion(): boolean | null {
    return this.#shown()?.calmMotion ?? null;
  }

  /** Applies the value the backend holds, without writing it back: from `connect` or a pushed change. */
  public accept(incoming: Revisioned<AppearanceState>): void {
    this.#replica.accept(incoming);
  }

  /**
   * Saves `patch`; `null` fields stay as they are. Throws on failure, after it rolls back its own
   * optimistic change.
   */
  public async update(patch: AppearancePatch): Promise<void> {
    const base = this.#shown();
    // Before the first load there is nothing to apply the change to; the saved answer is shown.
    const optimistic = base && {
      artworkBackdrop: patch.artworkBackdrop ?? base.artworkBackdrop,
      calmMotion: patch.calmMotion ?? base.calmMotion,
    };
    this.#optimistic = optimistic;
    try {
      this.accept(await this.#appearance.update(patch));
    } finally {
      // Only clear our own change: a newer save may have started while this one was pending.
      if (this.#optimistic === optimistic) this.#optimistic = null;
    }
  }

  #shown(): AppearanceState | null {
    return this.#optimistic ?? this.#replica.value;
  }
}
