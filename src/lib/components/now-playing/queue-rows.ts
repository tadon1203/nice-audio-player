import type { PlaybackQueueItem } from "$lib/native";

/** History (oldest first), the current track, then what is upcoming, in the order it plays. */
export function buildQueueRows(
  history: readonly PlaybackQueueItem[],
  current: PlaybackQueueItem | null,
  upcoming: readonly PlaybackQueueItem[],
): PlaybackQueueItem[] {
  return [...history, ...(current !== null ? [current] : []), ...upcoming];
}

/** How many upcoming tracks the queue holds that are not listed. */
export function hiddenUpcomingCount(upcomingCount: number, listed: number): number {
  return Math.max(0, upcomingCount - listed);
}
