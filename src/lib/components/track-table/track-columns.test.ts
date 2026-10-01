import { describe, expect, it } from "vitest";
import {
  albumArtistOf,
  albumTrackColumns,
  hasSeveralDiscs,
  startsDisc,
  trackQuality,
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

describe("album track columns", () => {
  it("number the rows, keep the title flexible and take no sort keys", () => {
    expect(albumTrackColumns[0]).toMatchObject({ kind: "action", header: "#" });
    expect(albumTrackColumns.find((column) => column.id === "title")?.width).toBe("");
    for (const column of albumTrackColumns) expect(column.sortKey, column.id).toBeUndefined();
  });

  it("only hide below breakpoints the table defines", () => {
    for (const column of albumTrackColumns) {
      if (column.hideBelow) expect(trackTableBreakpoints).toHaveProperty(column.hideBelow);
    }
  });

  it("write quality like the signal path, without the codec", () => {
    expect(trackQuality({ bitDepth: 24, sampleRate: 96_000 })).toBe("24/96");
    expect(trackQuality({ bitDepth: 16, sampleRate: 44_100 })).toBe("16/44.1");
    expect(trackQuality({ bitDepth: null, sampleRate: 44_100 })).toBe("44.1 kHz");
    expect(trackQuality({ bitDepth: 16, sampleRate: null })).toBeNull();
    const quality = albumTrackColumns.find((column) => column.id === "sampleRate") as TextColumn;
    expect(columnText(quality, { ...row, sampleRate: null })).toBe("—");
  });
});

describe("disc rows", () => {
  const discs = (...numbers: (number | null)[]) => numbers.map((discNumber) => ({ discNumber }));

  it("split an album on several discs where each disc begins", () => {
    const rows = discs(1, 1, 2, 2);
    expect(hasSeveralDiscs(rows)).toBe(true);
    expect(rows.map((_, index) => startsDisc(rows, index))).toEqual([true, false, true, false]);
  });

  it("add nothing to a single disc or to tracks without a disc number", () => {
    expect(hasSeveralDiscs(discs(1, 1))).toBe(false);
    expect(hasSeveralDiscs(discs(null, null))).toBe(false);
  });
});
