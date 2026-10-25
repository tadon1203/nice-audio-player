import { type QueueItem } from "#lib/native/bindings";

/** The rows of the queue as Now Playing lists them. */
export class QueueRows {
  /** History (oldest first), the current track, then what is upcoming, in the order it plays. */
  public static build(
    history: readonly QueueItem[],
    current: QueueItem | null,
    upcoming: readonly QueueItem[],
  ): QueueItem[] {
    return [...history, ...(current !== null ? [current] : []), ...upcoming];
  }

  /** How many upcoming tracks the queue holds that are not listed. */
  public static hiddenUpcomingCount(upcomingCount: number, listed: number): number {
    return Math.max(0, upcomingCount - listed);
  }
}
