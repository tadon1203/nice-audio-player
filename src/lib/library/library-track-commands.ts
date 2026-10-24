import type { library } from "#lib/native/commands";
import { type TrackId } from "#lib/native/bindings";

/** The commands on one Library track that do not change the catalog. */
export class LibraryTrackCommands {
  readonly #library: typeof library;

  public constructor(libraryCommands: typeof library) {
    this.#library = libraryCommands;
  }

  public async reveal(trackId: TrackId): Promise<void> {
    await this.#library.revealTrack(trackId);
  }
}
