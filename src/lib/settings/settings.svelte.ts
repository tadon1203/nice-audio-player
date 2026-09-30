import { nativeErrorCode } from "$lib/native";
import type {
  AppEvent,
  AppearanceSettings,
  Settings as BackendSettings,
  TNativeAPI,
} from "$lib/native";

/** The appearance fields the renderer may change. */
export type SettingsUpdate = {
  artworkBackdrop?: boolean;
  calmMotion?: boolean;
};

export type SettingsUpdateResult = { ok: true } | { ok: false; error: string };

/**
 * The renderer's mirror of the backend's settings: one store for every field. Changes apply at
 * once and are saved by the backend; a failed save rolls back, so the UI never disagrees with
 * what is stored.
 */
export class Settings {
  /** The last failed load or save, for display. Cleared by the next success. */
  error = $state<string | null>(null);

  #api: TNativeAPI;
  // Fields arrive optional (the backend fills defaults), so they are read defensively below.
  #mirror = $state.raw<BackendSettings>({});

  constructor(api: TNativeAPI) {
    this.#api = api;
  }

  /** Artwork light behind the library and Now Playing. On by default. */
  get artworkBackdrop(): boolean {
    return this.#mirror.appearance?.artworkBackdrop ?? true;
  }

  /** Only what marks the position moves by itself. Off by default. */
  get calmMotion(): boolean {
    return this.#mirror.appearance?.calmMotion ?? false;
  }

  async load(): Promise<void> {
    try {
      this.#mirror = await this.#api.getSettings();
      this.error = null;
    } catch (cause) {
      this.error = describe(cause, "Settings could not be loaded.");
    }
  }

  /** Applies the value the backend holds, without writing it back. */
  mirrorEvent(event: AppEvent): void {
    if (event.event === "settingsChanged") this.#mirror = event.payload;
  }

  async update(patch: SettingsUpdate): Promise<SettingsUpdateResult> {
    const previous = this.#mirror;
    const appearance: AppearanceSettings = { ...previous.appearance };
    if (patch.artworkBackdrop !== undefined) appearance.artworkBackdrop = patch.artworkBackdrop;
    if (patch.calmMotion !== undefined) appearance.calmMotion = patch.calmMotion;
    const optimistic = { ...previous, appearance };
    this.#mirror = optimistic;
    try {
      const saved = await this.#api.updateSettings({
        appearance: {
          artworkBackdrop: patch.artworkBackdrop ?? null,
          calmMotion: patch.calmMotion ?? null,
        },
      });
      this.#mirror = saved;
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

export function createSettings(api: TNativeAPI): Settings {
  return new Settings(api);
}

function describe(cause: unknown, fallback: string): string {
  const code = nativeErrorCode(cause);
  return code === null ? fallback : `${fallback} (${code})`;
}
