import { describe, expect, it } from "vitest";
import { TrackList } from "./track-list";

describe("TrackList.context", () => {
  it("sends an empty filter as no search", () => {
    const view = { filter: "", sortKey: "title", direction: "ascending" } as const;
    expect(TrackList.context(view)).toEqual({
      kind: "tracks",
      search: null,
      sortKey: "title",
      sortDirection: "ascending",
    });
    expect(TrackList.context({ ...view, filter: "x" })).toMatchObject({ search: "x" });
  });
});
