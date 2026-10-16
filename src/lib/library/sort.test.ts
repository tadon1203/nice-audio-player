import { describe, expect, it } from "vitest";
import { Sort } from "./sort";

describe("sort keys", () => {
  it("lists keys and options in one declared order", () => {
    expect(Sort.albumKeys).toEqual(["title", "artist", "year"]);
    expect(Sort.albumOptions.map((option) => option.key)).toEqual(Sort.albumKeys);
    expect(Sort.albumArtistOptions[1]).toEqual({ key: "albumCount", label: "Album count" });
    expect(Sort.trackKeys).toEqual(["title", "artist", "album", "duration"]);
  });

  it("guards only declared keys", () => {
    expect(Sort.isAlbumKey("year")).toBe(true);
    expect(Sort.isAlbumKey("duration")).toBe(false);
    expect(Sort.isAlbumKey("toString")).toBe(false);
    expect(Sort.isTrackKey("duration")).toBe(true);
  });
});

describe("Sort.toggleDirection", () => {
  it("flips between directions", () => {
    expect(Sort.toggleDirection("ascending")).toBe("descending");
    expect(Sort.toggleDirection("descending")).toBe("ascending");
  });
});
