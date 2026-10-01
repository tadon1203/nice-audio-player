import { describe, expect, it } from "vitest";
import type { PlaybackQueueItem } from "$lib/native";
import { buildQueueRows, gutterLabel, hiddenUpcomingCount } from "./queue-rows";

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
    expect(rows.map((row) => row.item.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("measures each row from the playing track", () => {
    const rows = buildQueueRows([item("a")], item("b"), [item("c"), item("d")]);
    expect(rows.map((row) => row.offset)).toEqual([-1, 0, 1, 2]);
  });

  it("leaves the current row out when nothing is current", () => {
    expect(buildQueueRows([], null, [item("c")]).map((row) => row.offset)).toEqual([1]);
  });
});

describe("hiddenUpcomingCount", () => {
  it("counts the upcoming tracks that are not listed", () => {
    expect(hiddenUpcomingCount(12, 2)).toBe(10);
    expect(hiddenUpcomingCount(2, 2)).toBe(0);
    expect(hiddenUpcomingCount(0, 2)).toBe(0);
  });
});

describe("gutterLabel", () => {
  it("numbers an upcoming track by how far away it is", () => {
    expect(gutterLabel(2)).toBe("2");
  });
});
