import { type AlbumId, type ArtistId } from "#lib/native/bindings";
import { describe, expect, it } from "vitest";
import { TrackColumns, type TextColumn, type TrackTableRow } from "./track-columns";

const row: TrackTableRow = {
  id: 1,
  title: "Song",
  artist: "Artist",
  album: {
    id: "0f0e0d0c0b0a09080706050403020100" as AlbumId,
    title: "Album",
    artist: { id: "5b3f2c1e0a9d8c7b6a5f4e3d2c1b0a99" as ArtistId, name: "Band" },
  },
  durationMs: 65_000,
  state: "playable",
};

const library = TrackColumns.library;
const album = TrackColumns.album;

describe("TrackColumns (library layout)", () => {
  it("declare a width per column, with the title taking the remaining space", () => {
    for (const column of library) expect(column.width, column.id).toBeDefined();
    expect(library.find((column) => column.id === "title")?.width).toBe("");
  });

  it("only hide below breakpoints the table defines", () => {
    for (const column of library) {
      if (column.hideBelow) expect(TrackColumns.breakpoints).toHaveProperty(column.hideBelow);
    }
  });

  it("map sortable columns to backend track sort keys", () => {
    expect(Object.fromEntries(library.map((c) => [c.id, c.sortKey]))).toMatchObject({
      title: "title",
      artist: "artist",
      album: "album",
      durationMs: "duration",
    });
  });

  it("show the missing marker for unknown values", () => {
    const albumColumn = library.find((column) => column.id === "album") as TextColumn;
    expect(TrackColumns.columnText(albumColumn, { ...row, album: null })).toBe("—");
    const time = library.find((column) => column.id === "durationMs") as TextColumn;
    expect(TrackColumns.columnText(time, row)).toBe("1:05");
  });

  it("picks the layout's columns", () => {
    expect(TrackColumns.of("library")).toBe(library);
    expect(TrackColumns.of("album")).toBe(album);
  });
});

describe("TrackColumns (album layout)", () => {
  it("number the rows, keep the title flexible and take no sort keys", () => {
    expect(album[0]).toMatchObject({ kind: "action", header: "#" });
    expect(album.find((column) => column.id === "title")?.width).toBe("");
    for (const column of album) expect(column.sortKey, column.id).toBeUndefined();
  });

  it("only hide below breakpoints the table defines", () => {
    for (const column of album) {
      if (column.hideBelow) expect(TrackColumns.breakpoints).toHaveProperty(column.hideBelow);
    }
  });

  it("write quality like the signal path, without the codec", () => {
    expect(TrackColumns.quality({ bitDepth: 24, sampleRate: 96_000 })).toBe("24/96");
    expect(TrackColumns.quality({ bitDepth: 16, sampleRate: 44_100 })).toBe("16/44.1");
    expect(TrackColumns.quality({ bitDepth: null, sampleRate: 44_100 })).toBe("44.1 kHz");
    expect(TrackColumns.quality({ bitDepth: 16, sampleRate: null })).toBeNull();
    const quality = album.find((column) => column.id === "sampleRate") as TextColumn;
    expect(TrackColumns.columnText(quality, { ...row, sampleRate: null })).toBe("—");
  });
});
