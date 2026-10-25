import { type LetterIndexEntry } from "#lib/native/bindings";

/**
 * The label a list position is filed under, read from the list's own letter index, so it can never
 * disagree with the order. `null` past the end or when the list has no index.
 */
export function labelAt(entries: readonly LetterIndexEntry[], position: number): string | null {
  let start = 0;
  for (const entry of entries) {
    if (position < start + entry.count) return entry.label;
    start += entry.count;
  }
  return null;
}

/** The row a label's entry starts at; `null` when there is no such label. */
export function skipTo(entries: readonly LetterIndexEntry[], label: string): number | null {
  return entries.find((entry) => entry.label === label)?.start ?? null;
}
