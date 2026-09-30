import { describe, expect, it } from "vitest";
import {
  albumArtistOf,
  columnText,
  libraryTrackColumns,
  ofTotal,
  rowClickIntent,
  trackRowAction,
  trackTableBreakpoints,
  type TrackTableRow,
} from "./track-columns";

const row: TrackTableRow = {
  id: "t1",
  title: "Song",
  artist: "Artist",
  album: "Album",
  albumArtist: null,
  durationMs: 65_000,
  availability: "available",
  playable: true,
};

describe("track columns", () => {
  it("declare a width per column, with the title taking the remaining space", () => {
    for (const column of libraryTrackColumns) expect(column.width, column.id).toBeDefined();
    expect(libraryTrackColumns.find((column) => column.id === "title")?.width).toBe("");
  });

  it("only hide below breakpoints the table defines", () => {
    for (const column of libraryTrackColumns) {
      if (column.hideBelow) expect(trackTableBreakpoints).toHaveProperty(column.hideBelow);
    }
  });

  it("map sortable columns to backend track sort keys", () => {
    expect(Object.fromEntries(libraryTrackColumns.map((c) => [c.id, c.sortKey]))).toMatchObject({
      title: "title",
      artist: "artist",
      album: "album",
      durationMs: "duration",
    });
  });

  it("show the missing marker for unknown values", () => {
    const album = libraryTrackColumns.find((column) => column.id === "album")!;
    expect(columnText(album, { ...row, album: null })).toBe("—");
    const time = libraryTrackColumns.find((column) => column.id === "durationMs")!;
    expect(columnText(time, row)).toBe("1:05");
  });
});

describe("track rows", () => {
  it("group under the album artist, else the artist", () => {
    expect(albumArtistOf({ albumArtist: " Band ", artist: "Solo" })).toBe("Band");
    expect(albumArtistOf({ albumArtist: null, artist: "Solo" })).toBe("Solo");
    expect(albumArtistOf({ albumArtist: null, artist: null })).toBe("");
  });

  it("offer Pause or Resume only for the active track", () => {
    expect(trackRowAction(row, "t1", "playing")).toMatchObject({ kind: "pause", persistent: true });
    expect(trackRowAction(row, "t1", "paused")).toMatchObject({ kind: "resume", persistent: true });
    expect(trackRowAction(row, "t2", "playing")).toMatchObject({ kind: "play", persistent: false });
    expect(trackRowAction(row, "t1", "stopped")).toMatchObject({
      kind: "play",
      label: "Play Song",
    });
  });

  it("decide what a row click does", () => {
    expect(rowClickIntent(row, null, "stopped")).toBe("play");
    expect(rowClickIntent(row, "t1", "playing")).toBeNull();
    expect(rowClickIntent(row, "t1", "paused")).toBe("resume");
    expect(rowClickIntent({ ...row, availability: "missing" }, null, "stopped")).toBeNull();
    expect(rowClickIntent({ ...row, playable: false }, null, "stopped")).toBeNull();
  });
});

describe("ofTotal", () => {
  it("formats number with an optional total", () => {
    expect(ofTotal(null, 12)).toBeNull();
    expect(ofTotal(3, null)).toBe("3");
    expect(ofTotal(3, 12)).toBe("3 of 12");
  });
});
