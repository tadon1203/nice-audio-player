import type { InfiniteData } from "@tanstack/svelte-query";
import { type CommandError } from "#lib/native/bindings";
import type { Result } from "#lib/native/result";
import type { Page } from "./types";

/** The rows of every page that loaded. A failed page adds none. */
export function loadedItems<Item>(
  data: InfiniteData<Result<Page<Item>>> | undefined,
): readonly Item[] {
  return data?.pages.flatMap((outcome) => (outcome.ok ? outcome.value.items : [])) ?? [];
}

/** The reason the first failed page failed, or null when no page has failed. */
export function pagesError(
  data: InfiniteData<Result<Page<unknown>>> | undefined,
): CommandError | null {
  const failed = data?.pages.find((outcome) => !outcome.ok);
  return failed !== undefined && !failed.ok ? failed.error : null;
}

/** The value of a query's Result, or undefined while it is pending or it failed. */
export function resultValue<Value>(outcome: Result<Value> | undefined): Value | undefined {
  return outcome?.ok ? outcome.value : undefined;
}

/** The reason a query's Result failed, or null when it has not failed. */
export function resultError(outcome: Result<unknown> | undefined): CommandError | null {
  return outcome !== undefined && !outcome.ok ? outcome.error : null;
}
