import { describe, expect, it } from "vitest";
import type { AlbumId, ArtistId, LyricsResolution, PlaybackItem } from "#lib/native";
import { TrackFacts } from "./track-facts";

const item: PlaybackItem = {
  queueItemId: 1,
  id: 1,
  title: "Song",
  artist: " Artist ",
  album: {
    id: "7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a20" as AlbumId,
    title: "Album",
    artist: { id: "5b3f2c1e0a9d8c7b6a5f4e3d2c1b0a99" as ArtistId, name: "Band" },
    trackCount: 12,
  },
  artwork: null,
  durationMs: 1000,
  trackNumber: 4,
  discNumber: 1,
  year: 2019,
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

describe("TrackFacts.of", () => {
  it("lists year, track of total and the decoded source", () => {
    expect(TrackFacts.of(item, "FLAC 24/96")).toEqual([2019, null, "Track 4 of 12", "FLAC 24/96"]);
  });

  it("mentions a disc only after the first", () => {
    expect(TrackFacts.of({ ...item, discNumber: 2 }, null)[1]).toBe("Disc 2");
  });

  it("drops the total when it is unknown or smaller than the number", () => {
    expect(TrackFacts.of({ ...item, album: null }, null)[2]).toBe("Track 4");
    expect(TrackFacts.of({ ...item, album: { ...item.album!, trackCount: 3 } }, null)[2]).toBe(
      "Track 4",
    );
    expect(TrackFacts.of({ ...item, trackNumber: null }, null)[2]).toBeNull();
  });
});

describe("TrackFacts.lyricsState", () => {
  it("says nothing before the lyrics are known or when they are synced", () => {
    expect(TrackFacts.lyricsState(null)).toEqual({ kind: "none" });
    expect(TrackFacts.lyricsState(resolved({ kind: "timed", lines: [] }))).toEqual({
      kind: "none",
    });
  });

  it("reports missing, unreadable, embedded fallback and unsynced lyrics", () => {
    expect(TrackFacts.lyricsState({ status: "notFound", trackId: 1 })).toEqual({
      kind: "notFound",
    });
    expect(
      TrackFacts.lyricsState({
        status: "sourceFailed",
        trackId: 1,
        sidecarFileName: "01 Song.lrc",
      }),
    ).toEqual({ kind: "sourceFailed", fileName: "01 Song.lrc" });
    expect(
      TrackFacts.lyricsState(resolved({ kind: "timed", lines: [] }, "sidecarFailedUsingEmbedded")),
    ).toEqual({ kind: "embedded" });
    expect(TrackFacts.lyricsState(resolved({ kind: "plain", lines: ["a"] }))).toEqual({
      kind: "unsynced",
    });
  });
});
