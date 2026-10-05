import { describe, expect, it } from "vitest";
import { albumArtistHref, albumEditionOf, albumHref } from "./routes";

describe("library routes", () => {
  it("encode names and carry an empty name as a tilde", () => {
    expect(albumHref({ albumArtist: "A/B", title: "C D", albumEdition: "" })).toBe(
      "/library/albums/A%2FB/C%20D",
    );
    expect(albumHref({ albumArtist: "", title: "", albumEdition: "" })).toBe("/library/albums/~/~");
    expect(albumArtistHref("~x")).toBe("/library/album-artists/~~x");
  });

  it("tells two printings of an album apart by their albumEdition", () => {
    const href = albumHref({ albumArtist: "A", title: "B", albumEdition: "1/Artist/B (Remaster)" });
    expect(href).toBe("/library/albums/A/B?albumEdition=1%2FArtist%2FB%20(Remaster)");
    const search = new URL(href, "http://app").searchParams;
    expect(albumEditionOf(search)).toBe("1/Artist/B (Remaster)");
    expect(albumEditionOf(new URLSearchParams())).toBe("");
  });
});
