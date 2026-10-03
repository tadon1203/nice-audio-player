import { describe, expect, it } from "vitest";
import { trackListContext } from "./track-list";

describe("trackListContext", () => {
  it("sends an empty filter as no search", () => {
    const view = { filter: "", sortKey: "title", direction: "ascending" } as const;
    expect(trackListContext(view)).toEqual({
      kind: "tracks",
      search: null,
      sortKey: "title",
      sortDirection: "ascending",
    });
    expect(trackListContext({ ...view, filter: "x" })).toMatchObject({ search: "x" });
  });
});
