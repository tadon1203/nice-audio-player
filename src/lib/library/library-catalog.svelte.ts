import type { CreateInfiniteQueryOptions, InfiniteData } from "@tanstack/svelte-query";
import { type ScrollIndexBucket, type LibraryStatus } from "#lib/native/bindings";
import {
  type CatalogRepository,
  type LibraryCatalogItem,
  type LibraryCatalogRequest,
  type Page,
} from "./catalog-repository";
import { LibraryErrors } from "./library-errors";
import { LibraryQueryKeys } from "./library-query-keys";
import { PagedCollection } from "./paged-collection.svelte";
import { QueryResult } from "./query-result.svelte";

/** Which single region owns the workspace; states never compete. */
export type LibraryViewState =
  | "loading"
  | "statusError"
  | "unavailable"
  | "catalogError"
  | "empty"
  | "content";

/** How long typing pauses before the filter reaches the query. The input itself never waits. */
const FILTER_DEBOUNCE_MS = 120;

/** The filter the query uses, with the presentation it was typed for. */
interface SettledFilter {
  readonly presentation: LibraryCatalogRequest["presentation"];
  readonly filter: string;
}

/**
 * A presentation's list, its scroll index, and its one view state. Loads the list once the library
 * is ready and derives the one view state to render. The filter is debounced into the query key so
 * typing stays responsive while the list refetches; the previous list of the same presentation stays
 * on screen until the new one arrives. Construct during component initialization.
 */
export class LibraryCatalog<TRequest extends LibraryCatalogRequest> {
  readonly #request: () => TRequest;
  readonly #status: QueryResult<LibraryStatus>;
  readonly #pages: PagedCollection<Page<LibraryCatalogItem<TRequest["presentation"]>>>;
  readonly #index: QueryResult<ScrollIndexBucket[]>;
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

  get #statusMessage(): string | null {
    return this.#status.data ? LibraryErrors.statusMessage(this.#status.data) : null;
  }

  get #ready(): boolean {
    return this.#status.data?.status === "ready";
  }

  get #viewState(): LibraryViewState {
    return this.#status.isError
      ? "statusError"
      : this.#statusMessage !== null
        ? "unavailable"
        : this.#status.isPending || this.#pages.isPending
          ? "loading"
          : this.#pages.isError
            ? "catalogError"
            : this.#pages.items.length === 0
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

  public constructor(catalog: CatalogRepository, request: () => TRequest) {
    this.#request = request;
    this.#status = new QueryResult(() => catalog.statusOptions());
    this.#pages = new PagedCollection(() => this.#pageOptions(catalog));
    // The scroll index follows the list's filter and sort (not where it was entered), so a jump
    // keeps the buckets it was made from.
    this.#index = new QueryResult(() => ({
      ...catalog.indexOptions(this.#queryRequest, this.#ready),
      placeholderData: (
        previous: ScrollIndexBucket[] | undefined,
      ): ScrollIndexBucket[] | undefined => previous,
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
    return this.#statusMessage;
  }

  /** The failure of the status query, if the status could not be read. */
  public get statusError(): Error | null {
    return this.#status.error;
  }

  /** True while the list refetches behind existing content. */
  public get updating(): boolean {
    return this.#updating;
  }

  public get items(): readonly LibraryCatalogItem<TRequest["presentation"]>[] {
    return this.#pages.items;
  }

  public get totalCount(): number | null {
    return this.#pages.totalCount;
  }

  /** The list's scroll index: buckets of names in list order; empty when the sort has none. */
  public get index(): readonly ScrollIndexBucket[] {
    return this.#index.data ?? [];
  }

  public get error(): Error | null {
    return this.#pages.error;
  }

  public get hasNextPage(): boolean {
    return this.#pages.hasNextPage;
  }

  public get isFetchingNextPage(): boolean {
    return this.#pages.isFetchingNextPage;
  }

  public readonly fetchNextPage = (): Promise<void> => this.#pages.fetchNextPage();

  public readonly refetch = (): Promise<void> => this.#pages.refetch();

  public readonly refetchStatus = (): Promise<void> => this.#status.refetch();

  /**
   * The list's query options, with the previous list kept only while the presentation stays the
   * same. The query function is chosen by `presentation`, so its pages hold exactly that
   * presentation's item type; TypeScript cannot correlate the two through the union.
   */
  #pageOptions(
    catalog: CatalogRepository,
  ): CreateInfiniteQueryOptions<
    Page<LibraryCatalogItem<TRequest["presentation"]>>,
    Error,
    InfiniteData<Page<LibraryCatalogItem<TRequest["presentation"]>>>
  > {
    const presentation = this.#queryRequest.presentation;
    const keepWithinPresentation = <Data>(
      previousData: Data | undefined,
      previousQuery: { queryKey: readonly unknown[] } | undefined,
    ): Data | undefined =>
      previousQuery !== undefined &&
      LibraryQueryKeys.requestOf(previousQuery.queryKey).presentation === presentation
        ? previousData
        : undefined;
    return {
      ...catalog.pageOptions(this.#queryRequest, this.#ready),
      placeholderData: keepWithinPresentation,
    } as unknown as CreateInfiniteQueryOptions<
      Page<LibraryCatalogItem<TRequest["presentation"]>>,
      Error,
      InfiniteData<Page<LibraryCatalogItem<TRequest["presentation"]>>>
    >;
  }
}
