import { describe, expect, it } from "vitest";
import { Tracks } from "./tracks";

const track = {
  artist: "Artist",
  album: "Album",
  albumArtist: "Tag Album Artist",
  albumKey: { albumArtist: "Catalog Album Artist", title: "Catalog Album", albumEdition: "" },
};

describe("Tracks.links", () => {
  it("links the album the catalog files the track under, not the tags", () => {
    const links = Tracks.links(track);
    expect(links.album).toEqual({
      text: "Album",
      href: "/library/albums/Catalog%20Album%20Artist/Catalog%20Album",
    });
    expect(links.artist?.href).toBe("/library/album-artists/Catalog%20Album%20Artist");
  });

  it("falls back to the album artist tag, then the artist, without a catalog key", () => {
    expect(Tracks.links({ ...track, albumKey: null }).artist?.href).toBe(
      "/library/album-artists/Tag%20Album%20Artist",
    );
    const loose = Tracks.links({ ...track, albumKey: null, albumArtist: null });
    expect(loose.artist?.href).toBe("/library/album-artists/Artist");
    expect(loose.album?.href).toBeNull();
  });

  it("has no link for a missing artist or album", () => {
    expect(Tracks.links({ ...track, artist: null, albumKey: null }).artist).toBeNull();
    expect(Tracks.links({ ...track, album: " " }).album).toBeNull();
  });
});

describe("Tracks availability", () => {
  it("needs the file on disk and a playable track to play", () => {
    expect(Tracks.isFilePresent({ availability: "missing" })).toBe(false);
    expect(Tracks.isAvailable({ playable: true, availability: "available" })).toBe(true);
    expect(Tracks.isAvailable({ playable: false, availability: "available" })).toBe(false);
    expect(Tracks.isAvailable({ playable: true, availability: "missing" })).toBe(false);
  });
});
