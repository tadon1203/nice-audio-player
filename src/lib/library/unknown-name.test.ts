import { describe, expect, it } from "vitest";
import { albumTitleLabel, artistNameLabel, UNKNOWN_ALBUM, UNKNOWN_ARTIST } from "./unknown-name";

describe("unknown names", () => {
  it("labels an empty album title and artist name as unknown", () => {
    expect(albumTitleLabel("")).toBe(UNKNOWN_ALBUM);
    expect(artistNameLabel("")).toBe(UNKNOWN_ARTIST);
  });

  it("keeps a name that is there", () => {
    expect(albumTitleLabel("Abbey Road")).toBe("Abbey Road");
    expect(artistNameLabel("~tilde")).toBe("~tilde");
  });
});
