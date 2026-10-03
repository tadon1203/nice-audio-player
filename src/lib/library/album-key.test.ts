import { describe, expect, it } from "vitest";
import { albumItemKey } from "./album-key";

describe("albumItemKey", () => {
  it("names an album by both parts of its key", () => {
    const key = { albumArtist: "A", title: "B", edition: "1/x" };
    expect(albumItemKey(key)).toBe(albumItemKey({ ...key }));
    expect(albumItemKey(key)).not.toBe(
      albumItemKey({ albumArtist: "B", title: "A", edition: "1/x" }),
    );
  });

  it("tells two printings of the same title and artist apart", () => {
    expect(albumItemKey({ albumArtist: "A", title: "B", edition: "1/old" })).not.toBe(
      albumItemKey({ albumArtist: "A", title: "B", edition: "1/remaster" }),
    );
  });

  it("does not run the parts together", () => {
    expect(albumItemKey({ albumArtist: "AB", title: "", edition: "" })).not.toBe(
      albumItemKey({ albumArtist: "A", title: "B", edition: "" }),
    );
  });
});
