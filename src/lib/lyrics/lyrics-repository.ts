import { queryOptions, skipToken, type QueryClient } from "@tanstack/svelte-query";
import type { LyricsClient } from "#lib/native";

/** The lyrics queries. Lyrics come from local files, so they are read from the Backend once. */
export class LyricsRepository {
  static readonly #all = ["lyrics"] as const;

  readonly #client: LyricsClient;
  readonly #queryClient: QueryClient;

  public constructor(client: LyricsClient, queryClient: QueryClient) {
    this.#client = client;
    this.#queryClient = queryClient;
  }

  public trackOptions(trackId: string | null) {
    return queryOptions({
      queryKey: [...LyricsRepository.#all, trackId],
      queryFn: trackId === null ? skipToken : () => this.#client.trackLyrics(trackId),
      // Stay fresh until a library scan finishes (`refresh`), which is when an added or edited .lrc
      // file can be noticed.
      staleTime: Infinity,
      gcTime: Infinity,
    });
  }

  /** After a scan: lyrics files may have changed. */
  public refresh(): void {
    void this.#queryClient.invalidateQueries({ queryKey: LyricsRepository.#all });
  }
}
