import {
  createInfiniteQuery,
  type CreateInfiniteQueryOptions,
  type CreateInfiniteQueryResult,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/svelte-query";
import type { CommandError } from "#lib/native/bindings";
import type { Result } from "#lib/native/result";
import type { Page } from "./catalog-repository";

/**
 * The loaded pages of an infinite query as one list, with its paging state. Each page is a Result:
 * a failed page is held as the error of the list and adds no rows. Reads go through getters, so a
 * reader only depends on what it touches. Construct during component initialization.
 */
export class PagedCollection<
  TPage extends Page<unknown>,
  TKey extends QueryKey = QueryKey,
  TPageParam = unknown,
> {
  readonly #query: CreateInfiniteQueryResult<InfiniteData<Result<TPage>>, Error>;

  public constructor(
    options: () => CreateInfiniteQueryOptions<
      Result<TPage>,
      Error,
      InfiniteData<Result<TPage>>,
      TKey,
      TPageParam
    >,
  ) {
    this.#query = createInfiniteQuery(options);
  }

  public readonly fetchNextPage = async (): Promise<void> => {
    await this.#query.fetchNextPage();
  };

  public readonly refetch = async (): Promise<void> => {
    await this.#query.refetch();
  };

  /** The rows of every page that loaded. A failed page adds none. */
  public get items(): readonly TPage["items"][number][] {
    return (
      this.#query.data?.pages.flatMap((outcome) => (outcome.ok ? outcome.value.items : [])) ?? []
    );
  }

  public get totalCount(): number | null {
    const first = this.#query.data?.pages[0];
    return first?.ok ? first.value.total : null;
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

  /** The reason the first failed page failed, or null when no page has failed. */
  public get error(): CommandError | null {
    const failed = this.#query.data?.pages.find((outcome) => !outcome.ok);
    return failed !== undefined && !failed.ok ? failed.error : null;
  }

  public get hasNextPage(): boolean {
    return this.#query.hasNextPage;
  }

  public get isFetchingNextPage(): boolean {
    return this.#query.isFetchingNextPage;
  }
}
