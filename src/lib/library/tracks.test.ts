import { describe, expect, it } from "vitest";
import { isFilePresent, isTrackAvailable, trackLinks } from "./tracks";

const track = {
  artist: "Artist",
  album: "Album",
  albumArtist: "Tag Album Artist",
  albumKey: { albumArtist: "Catalog Album Artist", title: "Catalog Album", albumEdition: "" },
};

describe("trackLinks", () => {
  it("links the album the catalog files the track under, not the tags", () => {
    const links = trackLinks(track);
    expect(links.album).toEqual({
      text: "Album",
      href: "/library/albums/Catalog%20Album%20Artist/Catalog%20Album",
    });
    expect(links.artist?.href).toBe("/library/album-artists/Catalog%20Album%20Artist");
  });

  it("falls back to the album artist tag, then the artist, without a catalog key", () => {
    expect(trackLinks({ ...track, albumKey: null }).artist?.href).toBe(
      "/library/album-artists/Tag%20Album%20Artist",
    );
    const loose = trackLinks({ ...track, albumKey: null, albumArtist: null });
    expect(loose.artist?.href).toBe("/library/album-artists/Artist");
    expect(loose.album?.href).toBeNull();
  });

  it("has no link for a missing artist or album", () => {
    expect(trackLinks({ ...track, artist: null, albumKey: null }).artist).toBeNull();
    expect(trackLinks({ ...track, album: " " }).album).toBeNull();
  });
});

describe("availability", () => {
  it("needs the file on disk and a playable track to play", () => {
    expect(isFilePresent({ availability: "missing" })).toBe(false);
    expect(isTrackAvailable({ playable: true, availability: "available" })).toBe(true);
    expect(isTrackAvailable({ playable: false, availability: "available" })).toBe(false);
    expect(isTrackAvailable({ playable: true, availability: "missing" })).toBe(false);
  });
});
