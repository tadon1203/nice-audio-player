import { describe, expect, it } from "vitest";
import type { PlaybackQueueItem } from "$lib/native";
import { buildQueueRows, hiddenUpcomingCount } from "./queue-rows";

const item = (id: string): PlaybackQueueItem => ({
  id,
  trackId: id,
  title: id,
  artist: "Artist",
  album: null,
  artwork: null,
  durationMs: 60_000,
});

describe("buildQueueRows", () => {
  it("lists history, the current track, then upcoming, in queue order", () => {
    const rows = buildQueueRows([item("a")], item("b"), [item("c"), item("d")]);
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves the current track out when nothing is current", () => {
    expect(buildQueueRows([item("a")], null, [item("c")]).map((row) => row.id)).toEqual(["a", "c"]);
  });
});

describe("hiddenUpcomingCount", () => {
  it("counts the upcoming tracks that are not listed", () => {
    expect(hiddenUpcomingCount(12, 2)).toBe(10);
    expect(hiddenUpcomingCount(2, 2)).toBe(0);
    expect(hiddenUpcomingCount(0, 2)).toBe(0);
  });
});
