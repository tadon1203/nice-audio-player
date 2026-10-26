import { queryOptions, skipToken, type QueryClient } from "@tanstack/svelte-query";
import type { lyrics } from "#lib/native/commands";
import { type TrackId } from "#lib/native/bindings";
import { type Lyrics } from "#lib/native/bindings";
import type { Result } from "#lib/native/result";
import type {
  CreateQueryOptions,
  InitialDataFunction,
  QueryKeyWithDataTag,
} from "@tanstack/svelte-query";

/** The lyrics queries. Lyrics come from local files, so they are read from the Backend once. */
export class LyricsRepository {
  static readonly #all = ["lyrics"] as const;

  readonly #lyrics: typeof lyrics;
  readonly #queryClient: QueryClient;

  public constructor(lyricsCommands: typeof lyrics, queryClient: QueryClient) {
    this.#lyrics = lyricsCommands;
    this.#queryClient = queryClient;
  }

  public trackOptions(trackId: TrackId | null): CreateQueryOptions<
    Result<Lyrics>,
    Error,
    Result<Lyrics>,
    (number | "lyrics" | null)[]
  > & {
    initialData?: Result<Lyrics> | InitialDataFunction<Result<Lyrics>> | undefined;
  } & QueryKeyWithDataTag<(number | "lyrics" | null)[], Result<Lyrics>, Error> {
    return queryOptions({
      queryKey: [...LyricsRepository.#all, trackId],
      queryFn:
        trackId === null ? skipToken : (): Promise<Result<Lyrics>> => this.#lyrics.track(trackId),
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
