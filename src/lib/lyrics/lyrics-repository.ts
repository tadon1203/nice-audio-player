import { queryOptions, skipToken, type QueryClient } from "@tanstack/svelte-query";
import type { LyricsClient, TrackId } from "#lib/native";
import type { LyricsResolution } from "#lib/native";
import type {
  CreateQueryOptions,
  InitialDataFunction,
  QueryKeyWithDataTag,
} from "@tanstack/svelte-query";

/** The lyrics queries. Lyrics come from local files, so they are read from the Backend once. */
export class LyricsRepository {
  static readonly #all = ["lyrics"] as const;

  readonly #client: LyricsClient;
  readonly #queryClient: QueryClient;

  public constructor(client: LyricsClient, queryClient: QueryClient) {
    this.#client = client;
    this.#queryClient = queryClient;
  }

  public trackOptions(trackId: TrackId | null): CreateQueryOptions<
    LyricsResolution,
    Error,
    LyricsResolution,
    (number | "lyrics" | null)[]
  > & {
    initialData?: LyricsResolution | InitialDataFunction<LyricsResolution> | undefined;
  } & QueryKeyWithDataTag<(number | "lyrics" | null)[], LyricsResolution, Error> {
    return queryOptions({
      queryKey: [...LyricsRepository.#all, trackId],
      queryFn:
        trackId === null
          ? skipToken
          : (): Promise<LyricsResolution> => this.#client.trackLyrics(trackId),
      // Stay fresh until a library scan finishes (`refresh`), which is when an added or edited .lrc
      // file can be noticed.
      staleTime: Infinity,
      gcTime: Infinity,
    });
  }

  /** After a scan: lyrics files may have changed. */
  public refresh(): void {
    void this.#queryClient
      .invalidateQueries({ queryKey: LyricsRepository.#all })
      .catch(() => undefined);
  }
}
