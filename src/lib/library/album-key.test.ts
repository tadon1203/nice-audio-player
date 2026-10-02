import { describe, expect, it } from "vitest";
import { albumItemKey } from "./album-key";

describe("albumItemKey", () => {
  it("names an album by both parts of its key", () => {
    expect(albumItemKey({ albumArtist: "A", title: "B" })).toBe(
      albumItemKey({ albumArtist: "A", title: "B" }),
    );
    expect(albumItemKey({ albumArtist: "A", title: "B" })).not.toBe(
      albumItemKey({ albumArtist: "B", title: "A" }),
    );
  });

  it("does not run the parts together", () => {
    expect(albumItemKey({ albumArtist: "AB", title: "" })).not.toBe(
      albumItemKey({ albumArtist: "A", title: "B" }),
    );
  });
});
