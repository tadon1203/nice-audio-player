import type { QueueItemId } from "#lib/native";
import { describe, expect, it } from "vitest";
import type { PlaybackQueueItem } from "#lib/native";
import { buildQueueRows, hiddenUpcomingCount } from "./queue-rows";

const item = (id: QueueItemId): PlaybackQueueItem => ({
  id,
  trackId: id,
  title: String(id),
  artist: "Artist",
  album: null,
  artwork: null,
  durationMs: 60_000,
});

describe("buildQueueRows", () => {
  it("lists history, the current track, then upcoming, in queue order", () => {
    const rows = buildQueueRows([item(1)], item(2), [item(3), item(4)]);
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3, 4]);
  });

  it("leaves the current track out when nothing is current", () => {
    expect(buildQueueRows([item(1)], null, [item(3)]).map((row) => row.id)).toEqual([1, 3]);
  });
});

describe("hiddenUpcomingCount", () => {
  it("counts the upcoming tracks that are not listed", () => {
    expect(hiddenUpcomingCount(12, 2)).toBe(10);
    expect(hiddenUpcomingCount(2, 2)).toBe(0);
    expect(hiddenUpcomingCount(0, 2)).toBe(0);
  });
});
