import type { PlaybackQueueItem } from "$lib/native";

/** A row of the full queue column: how far from the playing track it is (negative = played). */
export type QueueRow = { item: PlaybackQueueItem; offset: number };

/** History (oldest first), the current track, then what is upcoming, in the order it plays. */
export function buildQueueRows(
  history: readonly PlaybackQueueItem[],
  current: PlaybackQueueItem | null,
  upcoming: readonly PlaybackQueueItem[],
): QueueRow[] {
  return [
    ...history.map((item) => ({ item, offset: -1 })),
    ...(current !== null ? [{ item: current, offset: 0 }] : []),
    ...upcoming.map((item, index) => ({ item, offset: index + 1 })),
  ];
}

/** How many upcoming tracks the queue holds that are not listed. */
export function hiddenUpcomingCount(upcomingCount: number, listed: number): number {
  return Math.max(0, upcomingCount - listed);
}

/** A future row's Gutter number: how many tracks from now it is. */
export function gutterLabel(offset: number): string {
  return String(offset);
}
