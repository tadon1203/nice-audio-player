import { createQuery, type CreateQueryResult } from "@tanstack/svelte-query";
import type { LyricsResolution } from "#lib/native";
import type { LyricsRepository } from "./lyrics-repository";

/** The lyrics of the track that is loaded. Construct during component initialization. */
export class TrackLyrics {
  readonly #query: CreateQueryResult<LyricsResolution, Error>;

  public constructor(lyrics: LyricsRepository, trackId: () => string | null) {
    this.#query = createQuery(() => lyrics.trackOptions(trackId()));
  }

  public get resolution(): LyricsResolution | null {
    return this.#query.data ?? null;
  }

  public get isPending(): boolean {
    return this.#query.isPending;
  }
}
