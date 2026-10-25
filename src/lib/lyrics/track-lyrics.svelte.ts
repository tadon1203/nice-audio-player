import { createQuery, type CreateQueryResult } from "@tanstack/svelte-query";
import { type Lyrics, type TrackId } from "#lib/native/bindings";
import type { LyricsRepository } from "./lyrics-repository";

/** The lyrics of the track that is loaded. Construct during component initialization. */
export class TrackLyrics {
  readonly #query: CreateQueryResult<Lyrics, Error>;

  public constructor(lyrics: LyricsRepository, trackId: () => TrackId | null) {
    this.#query = createQuery(() => lyrics.trackOptions(trackId()));
  }

  public get current(): Lyrics | null {
    return this.#query.data ?? null;
  }

  public get isPending(): boolean {
    return this.#query.isPending;
  }
}
