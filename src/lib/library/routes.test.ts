import { describe, expect, it } from "vitest";
import { albumArtistHref, albumHref } from "./routes";

describe("library routes", () => {
  it("encode names and carry an empty name as a tilde", () => {
    expect(albumHref("A/B", "C D")).toBe("/library/albums/A%2FB/C%20D");
    expect(albumHref("", "")).toBe("/library/albums/~/~");
    expect(albumArtistHref("~x")).toBe("/library/album-artists/~~x");
  });
});
