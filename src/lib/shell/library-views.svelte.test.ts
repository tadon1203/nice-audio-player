import { describe, expect, it } from "vitest";
import { createLibraryViews } from "./library-views.svelte";

describe("libraryViews", () => {
  it("starts from each presentation's default sort", () => {
    const views = createLibraryViews();
    expect(views.albums.request).toEqual({
      presentation: "albums",
      filter: "",
      sortKey: "title",
      direction: "ascending",
    });
    expect(views.albumArtists.sortKey).toBe("artist");
    expect(views.tracks.sortKey).toBe("title");
    expect(views.artistAlbums.sortKey).toBe("year");
  });

  it("keeps each presentation independent", () => {
    const views = createLibraryViews();
    views.albums.setFilter("abbey");
    views.tracks.setSort("duration", "descending");
    expect(views.albums.filter).toBe("abbey");
    expect(views.tracks.request.sortKey).toBe("duration");
    expect(views.tracks.direction).toBe("descending");
    expect(views.albumArtists.filter).toBe("");
    expect(views.albums.sortKey).toBe("title");
  });

  it("resets direction to ascending when the sort key changes without one", () => {
    const views = createLibraryViews();
    views.albums.setSort("year", "descending");
    views.albums.setSort("artist");
    expect(views.albums.direction).toBe("ascending");
  });

  it("toggles direction and changes stateKey with any part of the view", () => {
    const views = createLibraryViews();
    const before = views.albums.stateKey;
    views.albums.toggleDirection();
    expect(views.albums.direction).toBe("descending");
    expect(views.albums.stateKey).not.toBe(before);
    views.artistAlbums.toggleDirection();
    expect(views.artistAlbums.direction).toBe("descending");
  });
});
