import { describe, expect, it } from "vitest";
import { trackTableBreakpoints } from "./breakpoints";
import { albumTrackColumns, libraryTrackColumns } from "./track-columns";

const meta = (columns: typeof libraryTrackColumns) =>
  columns.map((column) => ({ id: column.id, ...column.meta }));

describe("track columns", () => {
  it("declare one width per column, with the title taking the remaining space", () => {
    for (const column of [...meta(libraryTrackColumns), ...meta(albumTrackColumns)]) {
      expect(column.width, column.id).toBeDefined();
    }
    expect(meta(libraryTrackColumns).find((column) => column.id === "title")?.width).toBe("");
  });

  it("only hide below breakpoints the table defines", () => {
    for (const column of meta(albumTrackColumns)) {
      if (column.hideBelow) expect(trackTableBreakpoints).toHaveProperty(column.hideBelow);
    }
  });

  it("map sortable library columns to backend track sort keys", () => {
    const sortKeys = Object.fromEntries(
      meta(libraryTrackColumns).map((column) => [column.id, column.sortKey]),
    );
    expect(sortKeys).toMatchObject({
      title: "title",
      artist: "artist",
      album: "album",
      durationMs: "duration",
    });
  });
});
