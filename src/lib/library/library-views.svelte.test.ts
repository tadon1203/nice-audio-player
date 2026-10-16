import { describe, expect, it } from "vitest";
import { LibraryViews } from "./library-views.svelte";

describe("LibraryViews", () => {
  it("starts from each presentation's default sort", () => {
    const views = new LibraryViews();
    expect(views.albums.request).toEqual({
      presentation: "albums",
      filter: "",
      sortKey: "title",
      direction: "ascending",
      skip: 0,
    });
    expect(views.albumArtists.sortKey).toBe("artist");
    expect(views.tracks.sortKey).toBe("title");
    expect(views.artistAlbums.sortKey).toBe("year");
  });

  it("keeps each presentation independent", () => {
    const views = new LibraryViews();
    views.albums.setFilter("abbey");
    views.tracks.setSort("duration", "descending");
    expect(views.albums.filter).toBe("abbey");
    expect(views.tracks.request.sortKey).toBe("duration");
    expect(views.tracks.direction).toBe("descending");
    expect(views.albumArtists.filter).toBe("");
    expect(views.albums.sortKey).toBe("title");
  });

  it("enters a list at a letter and starts over from the top when the filter or sort changes", () => {
    const views = new LibraryViews();
    const top = views.tracks.stateKey;

    views.tracks.jumpTo(1_200);
    expect(views.tracks.request.skip).toBe(1_200);
    expect(views.tracks.stateKey).not.toBe(top);

    views.tracks.setFilter("x");
    expect(views.tracks.skip).toBe(0);
    views.tracks.jumpTo(5);
    views.tracks.setSort("artist");
    expect(views.tracks.skip).toBe(0);
    views.tracks.jumpTo(5);
    views.tracks.toggleDirection();
    expect(views.tracks.skip).toBe(0);
  });

  it("resets direction to ascending when the sort key changes without one", () => {
    const views = new LibraryViews();
    views.albums.setSort("year", "descending");
    views.albums.setSort("artist");
    expect(views.albums.direction).toBe("ascending");
  });

  it("toggles direction and changes stateKey with any part of the view", () => {
    const views = new LibraryViews();
    const before = views.albums.stateKey;
    views.albums.toggleDirection();
    expect(views.albums.direction).toBe("descending");
    expect(views.albums.stateKey).not.toBe(before);
    views.artistAlbums.toggleDirection();
    expect(views.artistAlbums.direction).toBe("descending");
  });
});
