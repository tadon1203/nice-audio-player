import { describe, expect, it } from "vitest";
import {
  albumArtistSortOptions,
  albumSortKeys,
  albumSortOptions,
  isAlbumSortKey,
  isTrackSortKey,
  toggleSortDirection,
  trackSortKeys,
} from "./sort";

describe("sort keys", () => {
  it("lists keys and options in one declared order", () => {
    expect(albumSortKeys).toEqual(["title", "artist", "year"]);
    expect(albumSortOptions.map((option) => option.key)).toEqual(albumSortKeys);
    expect(albumArtistSortOptions[1]).toEqual({ key: "albumCount", label: "Album count" });
    expect(trackSortKeys).toEqual(["title", "artist", "album", "duration"]);
  });

  it("guards only declared keys", () => {
    expect(isAlbumSortKey("year")).toBe(true);
    expect(isAlbumSortKey("duration")).toBe(false);
    expect(isAlbumSortKey("toString")).toBe(false);
    expect(isTrackSortKey("duration")).toBe(true);
  });
});

describe("toggleSortDirection", () => {
  it("flips between directions", () => {
    expect(toggleSortDirection("ascending")).toBe("descending");
    expect(toggleSortDirection("descending")).toBe("ascending");
  });
});
