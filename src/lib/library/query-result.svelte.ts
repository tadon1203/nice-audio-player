import {
  createQuery,
  type CreateQueryOptions,
  type CreateQueryResult,
  type QueryKey,
} from "@tanstack/svelte-query";
import type { CommandError } from "#lib/native/bindings";
import type { Result } from "#lib/native/result";

/**
 * One query, read through getters. Its query function returns a Result, so a failed Backend call
 * is held as the error of the query, not thrown. Construct during component initialization.
 */
export class QueryResult<T, TKey extends QueryKey = QueryKey> {
  readonly #query: CreateQueryResult<Result<T>, Error>;

  public constructor(options: () => CreateQueryOptions<Result<T>, Error, Result<T>, TKey>) {
    this.#query = createQuery(options);
  }

  /** The value the query read, or undefined while it is pending or it failed. */
  public get data(): T | undefined {
    const outcome = this.#query.data;
    return outcome?.ok ? outcome.value : undefined;
  }

  public get isPending(): boolean {
    return this.#query.isPending;
  }

  /** The reason the read failed, or null when it has not failed. */
  public get error(): CommandError | null {
    const outcome = this.#query.data;
    return outcome !== undefined && !outcome.ok ? outcome.error : null;
  }

  public readonly refetch = async (): Promise<void> => {
    await this.#query.refetch();
  };
}
