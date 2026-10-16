import {
  createQuery,
  type CreateQueryOptions,
  type CreateQueryResult,
  type QueryKey,
} from "@tanstack/svelte-query";

/** One query, read through getters. Construct during component initialization. */
export class QueryResult<T, TKey extends QueryKey = QueryKey> {
  readonly #query: CreateQueryResult<T, Error>;

  public constructor(options: () => CreateQueryOptions<T, Error, T, TKey>) {
    this.#query = createQuery(options);
  }

  public get data(): T | undefined {
    return this.#query.data;
  }

  public get isPending(): boolean {
    return this.#query.isPending;
  }

  public get isError(): boolean {
    return this.#query.isError;
  }

  public get error(): Error | null {
    return this.#query.error;
  }

  public readonly refetch = async (): Promise<void> => {
    await this.#query.refetch();
  };
}
