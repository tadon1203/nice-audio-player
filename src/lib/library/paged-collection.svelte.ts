import {
  createInfiniteQuery,
  type CreateInfiniteQueryOptions,
  type CreateInfiniteQueryResult,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/svelte-query";
import type { Page } from "./catalog-repository";

/**
 * The loaded pages of an infinite query as one list, with its paging state. Reads go through
 * getters, so a reader only depends on what it touches. Construct during component initialization.
 */
export class PagedCollection<
  TPage extends Page<unknown>,
  TKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> {
  readonly #query: CreateInfiniteQueryResult<InfiniteData<TPage>, Error>;

  public constructor(
    options: () => CreateInfiniteQueryOptions<TPage, Error, InfiniteData<TPage>, TKey, TPageParam>,
  ) {
    this.#query = createInfiniteQuery(options);
  }

  public readonly fetchNextPage = async (): Promise<void> => {
    await this.#query.fetchNextPage();
  };

  public readonly refetch = async (): Promise<void> => {
    await this.#query.refetch();
  };

  public get items(): readonly TPage["items"][number][] {
    return this.#query.data?.pages.flatMap((page) => page.items) ?? [];
  }

  public get totalCount(): number | null {
    return this.#query.data?.pages[0]?.totalCount ?? null;
  }

  public get isPending(): boolean {
    return this.#query.isPending;
  }

  public get isFetching(): boolean {
    return this.#query.isFetching;
  }

  public get isPlaceholderData(): boolean {
    return this.#query.isPlaceholderData;
  }

  public get isError(): boolean {
    return this.#query.isError;
  }

  public get error(): Error | null {
    return this.#query.error;
  }

  public get hasNextPage(): boolean {
    return this.#query.hasNextPage;
  }

  public get isFetchingNextPage(): boolean {
    return this.#query.isFetchingNextPage;
  }

  public get nextCursor(): string | null {
    return this.#query.data?.pages.at(-1)?.nextCursor ?? null;
  }
}
