import { describe, expect, it } from "vitest";
import {
  albumArtistOf,
  columnText,
  type TextColumn,
  libraryTrackColumns,
  trackRowState,
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
    const album = libraryTrackColumns.find((column) => column.id === "album") as TextColumn;
    expect(columnText(album, { ...row, album: null })).toBe("—");
    const time = libraryTrackColumns.find((column) => column.id === "durationMs") as TextColumn;
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
    const action = (id: string | null, status: Parameters<typeof trackRowState>[2]) =>
      trackRowState(row, id, status).action;
    expect(action("t1", "playing")).toMatchObject({ kind: "pause", persistent: true });
    expect(action("t1", "paused")).toMatchObject({ kind: "resume", persistent: true });
    expect(action("t2", "playing")).toMatchObject({ kind: "play", persistent: false });
    expect(action("t1", "stopped")).toMatchObject({ kind: "play", label: "Play Song" });
  });

  it("decide what a row click does", () => {
    const intent = (
      r: TrackTableRow,
      id: string | null,
      status: "stopped" | "playing" | "paused",
    ) => trackRowState(r, id, status).clickIntent;
    expect(intent(row, null, "stopped")).toBe("play");
    expect(intent(row, "t1", "playing")).toBeNull();
    expect(intent(row, "t1", "paused")).toBe("resume");
    expect(intent({ ...row, availability: "missing" }, null, "stopped")).toBeNull();
    expect(intent({ ...row, playable: false }, null, "stopped")).toBeNull();
  });

  it("report the playback state only for the active track", () => {
    expect(trackRowState(row, "t1", "playing").playbackState).toBe("playing");
    expect(trackRowState(row, "t1", "paused").playbackState).toBe("paused");
    expect(trackRowState(row, "t1", "stopped").playbackState).toBeUndefined();
    expect(trackRowState(row, "t2", "playing").playbackState).toBeUndefined();
  });
});
