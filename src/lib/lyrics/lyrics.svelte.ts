import { queryOptions, skipToken, type QueryClient } from "@tanstack/svelte-query";
import type { lyrics } from "#lib/native/commands";
import { type Lyrics as TrackLyrics, type TrackId } from "#lib/native/bindings";
import type { Result } from "#lib/native/result";
import type { ResultQueryOptions } from "#lib/native/query-types";

/** The query key of one track's lyrics. */
function trackKey(trackId: TrackId | null): readonly unknown[] {
  return ["lyrics", trackId];
}

/**
 * The lyrics of the tracks. Lyrics come from local files, so each track is read from the Backend
 * once. A component reads a track's lyrics with `createQuery` and `getTrack`.
 */
export class Lyrics {
  readonly #commands: typeof lyrics;
  readonly #queryClient: QueryClient;

  public constructor(commands: typeof lyrics, queryClient: QueryClient) {
    this.#commands = commands;
    this.#queryClient = queryClient;
  }

  public getTrack(trackId: TrackId | null): ResultQueryOptions<TrackLyrics> {
    return queryOptions({
      queryKey: trackKey(trackId),
      queryFn:
        trackId === null
          ? skipToken
          : (): Promise<Result<TrackLyrics>> => this.#commands.track(trackId),
      // Stay fresh until a library scan finishes (`refresh`), which is when an added or edited .lrc
      // file can be noticed.
      staleTime: Infinity,
      gcTime: Infinity,
    });
  }

  /** After a scan: lyrics files may have changed. */
  public refresh(): void {
    void this.#queryClient.invalidateQueries({ queryKey: ["lyrics"] }).catch(() => undefined);
  }
}
