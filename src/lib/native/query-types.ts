import type {
  CreateInfiniteQueryOptions,
  CreateQueryOptions,
  InfiniteData,
  QueryKeyWithDataTag,
} from "@tanstack/svelte-query";
import type { Result } from "#lib/native/result";

/** The options of a query whose data is one Result. */
export type ResultQueryOptions<Value> = CreateQueryOptions<
  Result<Value>,
  Error,
  Result<Value>,
  readonly unknown[]
> &
  QueryKeyWithDataTag<readonly unknown[], Result<Value>, Error>;

/** The options of an infinite query whose pages are Results of `Page`. */
export type ResultPagesOptions<TPage> = CreateInfiniteQueryOptions<
  Result<TPage>,
  Error,
  InfiniteData<Result<TPage>, unknown>,
  readonly unknown[],
  number
> &
  QueryKeyWithDataTag<readonly unknown[], InfiniteData<Result<TPage>, unknown>, Error>;
