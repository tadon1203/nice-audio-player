import { describe, expect, it } from "vitest";
import type { LyricsResolution, PlaybackItem } from "#lib/native";
import { lyricsState, trackFacts } from "./track-facts";

const item: PlaybackItem = {
  queueItemId: 1,
  trackId: 1,
  title: "Song",
  artist: " Artist ",
  album: "Album",
  albumArtist: null,
  artwork: null,
  durationMs: 1000,
  trackNumber: 4,
  discNumber: 1,
  year: 2019,
  albumKey: { albumArtist: "Album Artist", title: "Album", albumEdition: "" },
  albumId: "7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a20",
  albumArtistId: "5b3f2c1e0a9d8c7b6a5f4e3d2c1b0a99",
  albumTrackCount: 12,
};

const resolved = (
  content: Extract<LyricsResolution, { status: "resolved" }>["document"]["content"],
  notice: "sidecarFailedUsingEmbedded" | null = null,
): LyricsResolution => ({
  status: "resolved",
  trackId: 1,
  notice,
  document: { source: "sidecar", language: null, content },
});

describe("trackFacts", () => {
  it("lists year, track of total and the decoded source", () => {
    expect(trackFacts(item, "FLAC 24/96")).toEqual([2019, null, "Track 4 of 12", "FLAC 24/96"]);
  });

  it("mentions a disc only after the first", () => {
    expect(trackFacts({ ...item, discNumber: 2 }, null)[1]).toBe("Disc 2");
  });

  it("drops the total when it is unknown or smaller than the number", () => {
    expect(trackFacts({ ...item, albumTrackCount: null }, null)[2]).toBe("Track 4");
    expect(trackFacts({ ...item, albumTrackCount: 3 }, null)[2]).toBe("Track 4");
    expect(trackFacts({ ...item, trackNumber: null }, null)[2]).toBeNull();
  });
});

describe("lyricsState", () => {
  it("says nothing before the lyrics are known or when they are synced", () => {
    expect(lyricsState(null)).toEqual({ kind: "none" });
    expect(lyricsState(resolved({ kind: "timed", lines: [] }))).toEqual({ kind: "none" });
  });

  it("reports missing, unreadable, embedded fallback and unsynced lyrics", () => {
    expect(lyricsState({ status: "notFound", trackId: 1 })).toEqual({ kind: "notFound" });
    expect(
      lyricsState({ status: "sourceFailed", trackId: 1, sidecarFileName: "01 Song.lrc" }),
    ).toEqual({ kind: "sourceFailed", fileName: "01 Song.lrc" });
    expect(
      lyricsState(resolved({ kind: "timed", lines: [] }, "sidecarFailedUsingEmbedded")),
    ).toEqual({ kind: "embedded" });
    expect(lyricsState(resolved({ kind: "plain", lines: ["a"] }))).toEqual({
      kind: "unsynced",
    });
  });
});
