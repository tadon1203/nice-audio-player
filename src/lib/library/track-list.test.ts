import { describe, expect, it } from "vitest";
import { trackIndexKey, trackListContext } from "./track-list";

describe("trackListContext", () => {
  it("sends an empty filter as no search", () => {
    const view = { filter: "", sortKey: "title", direction: "ascending" } as const;
    expect(trackListContext(view)).toEqual({
      kind: "tracks",
      search: null,
      sortKey: "title",
      sortDirection: "ascending",
    });
    expect(trackListContext({ ...view, filter: "x" })).toMatchObject({ search: "x" });
  });
});

describe("trackIndexKey", () => {
  const track = { title: "Beta", artist: "Alpha", album: null };
  it("follows the sort key", () => {
    expect(trackIndexKey(track, "title")).toBe("B");
    expect(trackIndexKey(track, "artist")).toBe("A");
    expect(trackIndexKey(track, "duration")).toBeNull();
  });
  it("falls back to an empty name when the value is unknown", () => {
    expect(trackIndexKey(track, "album")).toBe(trackIndexKey({ ...track, title: "" }, "title"));
  });
});
