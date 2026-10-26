import { type LibraryState } from "#lib/native/bindings";

/**
 * The Library state as the Backend last pushed it: availability, directories, scan, and the Library
 * version. The version moves after each committed change that alters a list, so when it moves the
 * catalog and the lyrics are refreshed.
 */
export class LibraryStateReplica {
  #snapshot = $state.raw<LibraryState | null>(null);
  readonly #onVersionChange: () => void;
  #libraryVersion = 0;

  /** `onVersionChange` runs when the Library version moves, which is when lists may have changed. */
  public constructor(onVersionChange: () => void) {
    this.#onVersionChange = onVersionChange;
  }

  /** The Library state as the Backend last pushed it; `null` until the first push arrives. */
  public get snapshot(): LibraryState | null {
    return this.#snapshot;
  }

  public accept(state: LibraryState): void {
    this.#snapshot = state;
    if (state.version === this.#libraryVersion) return;
    this.#libraryVersion = state.version;
    this.#onVersionChange();
  }
}
