import { type QueueItemId } from "#lib/native/bindings";
import { describe, expect, it } from "vitest";
import { type PlaybackQueueItem } from "#lib/native/bindings";
import { QueueRows } from "./queue-rows";

const item = (id: QueueItemId): PlaybackQueueItem => ({
  queueItemId: id,
  id,
  title: String(id),
  artist: "Artist",
  album: null,
  artwork: null,
  durationMs: 60_000,
});

describe("QueueRows.build", () => {
  it("lists history, the current track, then upcoming, in queue order", () => {
    const rows = QueueRows.build([item(1)], item(2), [item(3), item(4)]);
    expect(rows.map((row) => row.queueItemId)).toEqual([1, 2, 3, 4]);
  });

  it("leaves the current track out when nothing is current", () => {
    expect(QueueRows.build([item(1)], null, [item(3)]).map((row) => row.queueItemId)).toEqual([
      1, 3,
    ]);
  });
});

describe("QueueRows.hiddenUpcomingCount", () => {
  it("counts the upcoming tracks that are not listed", () => {
    expect(QueueRows.hiddenUpcomingCount(12, 2)).toBe(10);
    expect(QueueRows.hiddenUpcomingCount(2, 2)).toBe(0);
    expect(QueueRows.hiddenUpcomingCount(0, 2)).toBe(0);
  });
});
