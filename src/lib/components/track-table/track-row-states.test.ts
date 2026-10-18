import type { TrackId } from "#lib/native";
import { describe, expect, it } from "vitest";
import type { TrackTableRow } from "./track-columns";
import { TrackRowStates, type TrackRowAction } from "./track-row-states";

const row: TrackTableRow = {
  id: 1,
  title: "Song",
  artist: "Artist",
  album: null,
  durationMs: 65_000,
  state: "playable",
};

describe("TrackRowStates.of", () => {
  it("offer Pause or Resume only for the active track", () => {
    const action = (
      id: TrackId | null,
      status: Parameters<typeof TrackRowStates.of>[2],
    ): TrackRowAction => TrackRowStates.of(row, id, status).action;
    expect(action(1, "playing")).toMatchObject({ kind: "pause", persistent: true });
    expect(action(1, "paused")).toMatchObject({ kind: "resume", persistent: true });
    expect(action(2, "playing")).toMatchObject({ kind: "play", persistent: false });
    expect(action(1, "stopped")).toMatchObject({ kind: "play", label: "Play Song" });
  });

  it("decide what a row click does", () => {
    const intent = (
      r: TrackTableRow,
      id: TrackId | null,
      status: "stopped" | "playing" | "paused",
    ): ReturnType<typeof TrackRowStates.of>["clickIntent"] =>
      TrackRowStates.of(r, id, status).clickIntent;
    expect(intent(row, null, "stopped")).toBe("play");
    expect(intent(row, 1, "playing")).toBeNull();
    expect(intent(row, 1, "paused")).toBe("resume");
    expect(intent({ ...row, state: "missing" }, null, "stopped")).toBeNull();
    expect(intent({ ...row, state: "unsupported" }, null, "stopped")).toBeNull();
  });

  it("report the playback state only for the active track", () => {
    expect(TrackRowStates.of(row, 1, "playing").playbackState).toBe("playing");
    expect(TrackRowStates.of(row, 1, "paused").playbackState).toBe("paused");
    expect(TrackRowStates.of(row, 1, "stopped").playbackState).toBeUndefined();
    expect(TrackRowStates.of(row, 2, "playing").playbackState).toBeUndefined();
  });
});
