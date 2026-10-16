import { nativeErrorCode } from "#lib/native";
import type { Appearance as AppearanceState, TNativeAPI, Versioned } from "#lib/native";
import { isNewerRevision } from "#lib/utils/revision";

/** The appearance fields the renderer may change. */
export type AppearanceUpdate = {
  artworkBackdrop?: boolean;
  calmMotion?: boolean;
};

export type AppearanceUpdateResult = { ok: true } | { ok: false; error: string };

/**
 * The renderer's mirror of the backend's appearance: one store for every field. Changes apply at
 * once and are saved by the backend; a failed save rolls back, so the UI never disagrees with
 * what is stored. The mirror keeps a value only if its revision is newer than the one it holds.
 */
export class Appearance {
  /** The last failed load or save, for display. Cleared by the next success. */
  error = $state<string | null>(null);

  readonly #api: TNativeAPI;
  // The backend owns the defaults; nothing is known until the first load.
  #mirror = $state.raw<AppearanceState | null>(null);
  #revision: number | null = null;

  constructor(api: TNativeAPI) {
    this.#api = api;
  }

  /** Artwork glow behind the library and Now Playing; `null` until the appearance has loaded. */
  get artworkBackdrop(): boolean | null {
    return this.#mirror?.artworkBackdrop ?? null;
  }

  /** Only what marks the position moves by itself; `null` until the appearance has loaded. */
  get calmMotion(): boolean | null {
    return this.#mirror?.calmMotion ?? null;
  }

  /** Applies the value the backend holds, without writing it back: from `connect` or a pushed change. */
  accept({ revision, value }: Versioned<AppearanceState>): void {
    if (!isNewerRevision(revision, this.#revision)) return;
    this.#revision = revision;
    this.#mirror = value;
  }

  /** `connect` failed, so the appearance stays unknown. */
  initializeFailed(cause: unknown): void {
    this.error = describe(cause, "Settings could not be loaded.");
  }

  async update(patch: AppearanceUpdate): Promise<AppearanceUpdateResult> {
    const previous = this.#mirror;
    // Before the first load there is nothing to apply the change to; the saved answer is shown.
    const optimistic = previous && {
      ...previous,
      ...(patch.artworkBackdrop === undefined ? {} : { artworkBackdrop: patch.artworkBackdrop }),
      ...(patch.calmMotion === undefined ? {} : { calmMotion: patch.calmMotion }),
    };
    this.#mirror = optimistic;
    try {
      const saved = await this.#api.updateAppearance({
        artworkBackdrop: patch.artworkBackdrop ?? null,
        calmMotion: patch.calmMotion ?? null,
      });
      this.accept(saved);
      this.error = null;
      return { ok: true };
    } catch (cause) {
      // Only undo our own write: an event may have replaced the mirror while the save was pending.
      if (this.#mirror === optimistic) this.#mirror = previous;
      const error = describe(cause, "The setting could not be saved.");
      this.error = error;
      return { ok: false, error };
    }
  }
}

function describe(cause: unknown, fallback: string): string {
  const code = nativeErrorCode(cause);
  return code === null ? fallback : `${fallback} (${code})`;
}
