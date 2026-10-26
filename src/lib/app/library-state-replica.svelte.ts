import { Replica } from "#lib/native/replica.svelte";
import { type LibraryState, type Versioned } from "#lib/native/bindings";

/**
 * The Library state as the Backend last pushed it: availability, directories, scan, and the Library
 * version. The version moves after each committed change that alters a list, so when it moves the
 * catalog and the lyrics are refreshed. The version only grows, so a change is never missed because
 * the states in between were coalesced.
 */
export class LibraryStateReplica {
  readonly #replica = new Replica<LibraryState>();
  readonly #onVersionChange: () => void;
  #libraryVersion = 0;

  /** `onVersionChange` runs when the Library version moves, which is when lists may have changed. */
  public constructor(onVersionChange: () => void) {
    this.#onVersionChange = onVersionChange;
  }

  /** The Library state as the Backend last pushed it; `null` until the first push arrives. */
  public get snapshot(): LibraryState | null {
    return this.#replica.value;
  }

  public accept(incoming: Versioned<LibraryState>): void {
    if (!this.#replica.accept(incoming)) return;
    const { version } = incoming.value;
    if (version === this.#libraryVersion) return;
    this.#libraryVersion = version;
    this.#onVersionChange();
  }
}
