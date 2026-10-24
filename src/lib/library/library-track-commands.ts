import { type LibraryClient } from "#lib/native/native-clients";
import { type TrackId } from "#lib/native/bindings";

/** The commands on one Library track that do not change the catalog. */
export class LibraryTrackCommands {
  readonly #client: LibraryClient;

  public constructor(client: LibraryClient) {
    this.#client = client;
  }

  public reveal(trackId: TrackId): Promise<void> {
    return this.#client.revealTrack(trackId);
  }
}
