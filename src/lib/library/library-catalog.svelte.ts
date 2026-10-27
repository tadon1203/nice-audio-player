import {
  createInfiniteQuery,
  createQuery,
  type CreateInfiniteQueryOptions,
  type CreateInfiniteQueryResult,
  type CreateQueryResult,
  type InfiniteData,
} from "@tanstack/svelte-query";
import {
  type CommandError,
  type LetterIndexEntry,
  type LibraryStatus,
  type ScanFailure,
} from "#lib/native/bindings";
import type { Result } from "#lib/native/result";
import type { Library } from "./library.svelte";
import { catalogRequestOf } from "./library-keys";
import type { LibraryCatalogItem, LibraryCatalogRequest, LibraryViewState, Page } from "./types";

/** How long typing pauses before the filter reaches the query. The input itself never waits. */
const FILTER_DEBOUNCE_MS = 120;

const scanFailureMessages = {
  directoryUnreadable: "A library directory could not be read.",
  failed: "The scan stopped unexpectedly.",
} as const satisfies Record<ScanFailure, string>;

/** The user-facing message for a Library status, or null when the Library is ready. */
export function libraryStatusMessage(status: LibraryStatus): string | null {
  if (status.status === "ready") return null;
  return "The library storage is unavailable.";
}

/** Explains why a scan failed; the caller already shows that it failed. */
export function scanFailureMessage(failureCode: string | null): string {
  return failureCode !== null && Object.hasOwn(scanFailureMessages, failureCode)
    ? scanFailureMessages[failureCode as ScanFailure]
    : "The scan stopped unexpectedly.";
}

/** The filter the query uses, with the presentation it was typed for. */
interface SettledFilter {
  readonly presentation: LibraryCatalogRequest["presentation"];
  readonly filter: string;
}

/**
 * A presentation's list, its letter index, and its one view state. Loads the list once the library
 * is ready and derives the one view state to render. The filter is debounced into the query key so
 * typing stays responsive while the list refetches; the previous list of the same presentation stays
 * on screen until the new one arrives. Created by `Library.catalog` during component initialization.
 */
export class LibraryCatalog<TRequest extends LibraryCatalogRequest> {
  readonly #library: Library;
  readonly #request: () => TRequest;
  readonly #pages: CreateInfiniteQueryResult<
    InfiniteData<Result<Page<LibraryCatalogItem<TRequest["presentation"]>>>>,
    Error
  >;
  readonly #index: CreateQueryResult<Result<LetterIndexEntry[]>, Error>;
  // Both start unset: until the debounce settles, the live request is the one in use.
  #settled = $state.raw<SettledFilter | null>(null);
  #shown = $state.raw<TRequest | null>(null);

  /** The request with the debounced filter; the live request while the filter is settling. */
  get #queryRequest(): TRequest {
    const current = this.#request();
    const settled = this.#settled;
    return settled !== null && settled.presentation === current.presentation
      ? ({ ...current, filter: settled.filter } as TRequest)
      : current;
  }

  get #libraryStatus(): LibraryStatus | null {
    return this.#library.state?.status ?? null;
  }

  get #ready(): boolean {
    return this.#libraryStatus?.status === "ready";
  }

  get #viewState(): LibraryViewState {
    return this.statusMessage !== null
      ? "unavailable"
      : this.#library.state === null || this.#pages.isPending
        ? "loading"
        : this.error !== null
          ? "catalogError"
          : this.items.length === 0
            ? "empty"
            : "content";
  }

  get #updating(): boolean {
    return (
      (this.#viewState === "content" ||
        this.#viewState === "empty" ||
        this.#viewState === "catalogError") &&
      !this.#pages.isFetchingNextPage &&
      (this.#pages.isFetching || this.#pages.isPlaceholderData)
    );
  }

  public constructor(library: Library, request: () => TRequest) {
    this.#library = library;
    this.#request = request;
    this.#pages = createInfiniteQuery(() => this.#pageOptions());
    // The letter index follows the list's filter and sort (not where it was entered), so a jump
    // keeps the entries it was made from.
    this.#index = createQuery(() => ({
      ...library.getCatalogIndex(this.#queryRequest, this.#ready),
      placeholderData: (
        previous: Result<LetterIndexEntry[]> | undefined,
      ): Result<LetterIndexEntry[]> | undefined => previous,
    }));

    $effect(() => {
      const { presentation, filter } = this.#request();
      const timer = setTimeout(
        () => (this.#settled = { presentation, filter }),
        FILTER_DEBOUNCE_MS,
      );
      return (): void => clearTimeout(timer);
    });
    // The request of the data on screen: it moves to the new request only when that data arrives.
    // An effect is needed because the value must remember the previous request.
    $effect(() => {
      if (!this.#pages.isPending && !this.#pages.isPlaceholderData)
        this.#shown = this.#queryRequest;
    });
  }

  /**
   * The request behind the list that shows. While a new list loads and the old one stays on
   * screen, it is the old request, so a play context built from it plays what the user sees.
   */
  public get request(): TRequest {
    return this.#shown ?? this.#queryRequest;
  }

  public get viewState(): LibraryViewState {
    return this.#viewState;
  }

  /** Why the library cannot be browsed, when its status says so. */
  public get statusMessage(): string | null {
    const status = this.#libraryStatus;
    return status ? libraryStatusMessage(status) : null;
  }

  /** True while the list refetches behind existing content. */
  public get updating(): boolean {
    return this.#updating;
  }

  /** The rows of every page that loaded. A failed page adds none. */
  public get items(): readonly LibraryCatalogItem<TRequest["presentation"]>[] {
    return (
      this.#pages.data?.pages.flatMap((outcome) => (outcome.ok ? outcome.value.items : [])) ?? []
    );
  }

  public get totalCount(): number | null {
    const first = this.#pages.data?.pages[0];
    return first?.ok ? first.value.total : null;
  }

  /** The list's letter index: entries of names in list order; empty when the sort has none. */
  public get index(): readonly LetterIndexEntry[] {
    const outcome = this.#index.data;
    return outcome?.ok ? outcome.value : [];
  }

  /** The reason the first failed page failed, or null when no page has failed. */
  public get error(): CommandError | null {
    const failed = this.#pages.data?.pages.find((outcome) => !outcome.ok);
    return failed !== undefined && !failed.ok ? failed.error : null;
  }

  public get hasNextPage(): boolean {
    return this.#pages.hasNextPage;
  }

  public get isFetchingNextPage(): boolean {
    return this.#pages.isFetchingNextPage;
  }

  public readonly fetchNextPage = async (): Promise<void> => {
    await this.#pages.fetchNextPage();
  };

  public readonly refetch = async (): Promise<void> => {
    await this.#pages.refetch();
  };

  /**
   * The list's query options, with the previous list kept only while the presentation stays the
   * same. The query function is chosen by `presentation`, so its pages hold exactly that
   * presentation's item type; TypeScript cannot correlate the two through the union.
   */
  #pageOptions(): CreateInfiniteQueryOptions<
    Result<Page<LibraryCatalogItem<TRequest["presentation"]>>>,
    Error,
    InfiniteData<Result<Page<LibraryCatalogItem<TRequest["presentation"]>>>>
  > {
    const presentation = this.#queryRequest.presentation;
    const keepWithinPresentation = <Data>(
      previousData: Data | undefined,
      previousQuery: { queryKey: readonly unknown[] } | undefined,
    ): Data | undefined =>
      previousQuery !== undefined &&
      catalogRequestOf(previousQuery.queryKey).presentation === presentation
        ? previousData
        : undefined;
    return {
      ...this.#library.getCatalogPages(this.#queryRequest, this.#ready),
      placeholderData: keepWithinPresentation,
    } as unknown as CreateInfiniteQueryOptions<
      Result<Page<LibraryCatalogItem<TRequest["presentation"]>>>,
      Error,
      InfiniteData<Result<Page<LibraryCatalogItem<TRequest["presentation"]>>>>
    >;
  }
}
