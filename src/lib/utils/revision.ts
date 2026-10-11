/**
 * The rule that orders state values: the first value is always kept; after it, only a newer
 * revision replaces the held one. Revisions only grow, per topic.
 */
export const isNewerRevision = (incoming: number, held: number | null): boolean =>
  held === null || incoming > held;
