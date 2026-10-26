import type { library } from "#lib/native/commands";
import { type TrackId } from "#lib/native/bindings";
import type { Result } from "#lib/native/result";

/** The commands on one Library track that do not change the catalog. */
export class LibraryTrackCommands {
  readonly #library: typeof library;

  public constructor(libraryCommands: typeof library) {
    this.#library = libraryCommands;
  }

  public reveal(trackId: TrackId): Promise<Result<null>> {
    return this.#library.revealTrack(trackId);
  }
}
