import type { ScrollIndexBucket } from "#lib/native";

/** Reads a list's scroll index: buckets in list order with their counts. */
export class ScrollIndex {
  /**
   * The label a list position is filed under, read from the list's own scroll index, so it can
   * never disagree with the order. `null` past the end or when the list has no index.
   */
  public static labelAt(buckets: readonly ScrollIndexBucket[], position: number): string | null {
    let start = 0;
    for (const bucket of buckets) {
      if (position < start + bucket.count) return bucket.label;
      start += bucket.count;
    }
    return null;
  }

  /** How many rows precede the first one filed under `label`; `null` when there is no such label. */
  public static skipTo(buckets: readonly ScrollIndexBucket[], label: string): number | null {
    let start = 0;
    for (const bucket of buckets) {
      if (bucket.label === label) return start;
      start += bucket.count;
    }
    return null;
  }
}
