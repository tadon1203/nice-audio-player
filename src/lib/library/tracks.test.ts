import { describe, expect, it } from "vitest";
import type { AlbumId, ArtistId } from "#lib/native";
import { Tracks } from "./tracks";

const albumId = "0f0e0d0c0b0a09080706050403020100" as AlbumId;
const albumArtistId = "5b3f2c1e0a9d8c7b6a5f4e3d2c1b0a99" as ArtistId;

const track = {
  artist: "Artist",
  album: { id: albumId, title: "Album", artistId: albumArtistId },
};

describe("Tracks.links", () => {
  it("links the album and the Album Artist by their IDs", () => {
    const links = Tracks.links(track);
    expect(links.album).toEqual({
      text: "Album",
      href: `/library/albums/${albumId}`,
    });
    expect(links.artist).toEqual({
      text: "Artist",
      href: `/library/album-artists/${albumArtistId}`,
    });
  });

  it("has no album link and no artist link for a track without an album, and no guess from the names", () => {
    const loose = Tracks.links({ ...track, album: null });
    expect(loose.album).toBeNull();
    expect(loose.artist?.href).toBeNull();
  });

  it("has no link for a missing artist or a blank album title", () => {
    expect(Tracks.links({ ...track, artist: null }).artist).toBeNull();
    expect(Tracks.links({ ...track, album: { ...track.album, title: " " } }).album).toBeNull();
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
