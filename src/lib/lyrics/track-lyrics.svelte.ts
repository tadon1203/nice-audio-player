import { createQuery, type CreateQueryResult } from "@tanstack/svelte-query";
import { type Lyrics, type TrackId } from "#lib/native/bindings";
import type { Result } from "#lib/native/result";
import type { LyricsRepository } from "./lyrics-repository";

/** The lyrics of the track that is loaded. Construct during component initialization. */
export class TrackLyrics {
  readonly #query: CreateQueryResult<Result<Lyrics>, Error>;

  public constructor(lyrics: LyricsRepository, trackId: () => TrackId | null) {
    this.#query = createQuery(() => lyrics.trackOptions(trackId()));
  }

  /**
   * The lyrics that were read, or null. A failed read also gives null: lyrics are optional, so
   * a track with none shows the same empty view as one whose read failed.
   */
  public get current(): Lyrics | null {
    const outcome = this.#query.data;
    return outcome?.ok ? outcome.value : null;
  }

  public get isPending(): boolean {
    return this.#query.isPending;
  }
}
