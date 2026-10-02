import { describe, expect, it } from "vitest";
import type { ActiveSession, PlaybackItem, PlaybackSnapshot } from "$lib/native";
import { createPlaybackClock } from "./clock";
import { clockReportOf } from "./snapshot";

const item = (id: string): PlaybackItem => ({
  queueItemId: id,
  trackId: id,
  file: { path: `C:/Music/${id}.mp3`, fileName: `${id}.mp3`, extension: "mp3" },
  title: id,
  artist: null,
  album: null,
  albumArtist: null,
  artwork: null,
  durationMs: 60_000,
  trackNumber: null,
  discNumber: null,
  year: null,
  albumKey: null,
  albumTrackCount: null,
});

const session = (id: string, positionMs: number, seekRevision = 0): ActiveSession => ({
  item: item(id),
  playbackId: "1",
  positionMs,
  seekRevision,
  durationMs: 60_000,
  outputDevice: { id: "speakers", name: "Speakers" },
  channelConversion: "none",
  sourceFormat: "FLAC",
  sourceBitDepth: 24,
  sourceBitrateKbps: null,
  sourceSampleRate: 44_100,
  outputSampleRate: 44_100,
  resamplingActive: false,
});

let revision = 0;
const snapshot = (
  status: "playing" | "paused",
  id: string,
  positionMs: number,
  seekRevision = 0,
): PlaybackSnapshot => ({
  status,
  base: {
    revision: (revision += 1),
    volume: 1,
    muted: false,
    outputSelection: { kind: "systemDefault" },
    canGoPrevious: false,
    canGoNext: false,
  },
  session: session(id, positionMs, seekRevision),
});

/** A clock on a hand-turned frame loop, so a test decides when time passes. */
function setup() {
  let now = 0;
  let pending: (() => void) | null = null;
  let frameRequests = 0;
  const clock = createPlaybackClock({
    now: () => now,
    requestFrame: (callback) => {
      frameRequests += 1;
      pending = callback;
      return frameRequests;
    },
    cancelFrame: () => {
      pending = null;
    },
    reducedMotion: () => true,
  });
  const report = (next: PlaybackSnapshot) => clock.accept(clockReportOf(next));
  const advance = (ms: number) => {
    now += ms;
    const callback = pending;
    pending = null;
    callback?.();
  };
  return { clock, report, advance, frames: () => frameRequests };
}

describe("playback clock", () => {
  it("moves the position every frame while playing, once someone holds it", () => {
    const { clock, report, advance, frames } = setup();
    report(snapshot("playing", "a", 10_000));
    expect(frames()).toBe(0);

    const release = clock.retain();
    advance(16);
    expect(clock.position.get()).toBe(10_016);
    advance(16);
    expect(clock.position.get()).toBe(10_032);

    release();
    const before = frames();
    advance(16);
    expect(frames()).toBe(before);
  });

  it("stands still while paused, and needs no frames", () => {
    const { clock, report, frames } = setup();
    clock.retain();
    report(snapshot("paused", "a", 10_000));
    expect(clock.position.get()).toBe(10_000);
    expect(frames()).toBe(0);
    expect(clock.playing()).toBe(false);
  });

  it("re-anchors on each report instead of drifting", () => {
    const { clock, report, advance } = setup();
    clock.retain();
    report(snapshot("playing", "a", 10_000));
    advance(250);
    report(snapshot("playing", "a", 10_240));
    advance(0);
    expect(clock.estimate()).toBe(10_240);
    expect(clock.position.get()).toBe(10_240);
  });

  it("announces a seek once, from the seek revision, and a new track", () => {
    const { clock, report, advance } = setup();
    const jumps: string[] = [];
    clock.onJump((jump) => jumps.push(`${jump.kind}:${jump.fromMs}->${jump.toMs}`));
    report(snapshot("playing", "a", 10_000));
    advance(500);
    report(snapshot("playing", "a", 40_000, 1));
    report(snapshot("playing", "a", 40_250, 1));
    report(snapshot("playing", "b", 0, 1));
    expect(jumps).toEqual(["seek:10500->40000", "track:40250->0"]);
  });

  it("draws the committed position, never the old one, while a seek is in flight", () => {
    const { clock, report, advance } = setup();
    const drawn: number[] = [];
    clock.position.subscribe((ms) => drawn.push(ms));
    clock.retain();
    report(snapshot("playing", "a", 10_000));
    advance(16);

    const release = clock.hold(40_000);
    advance(16);
    advance(16);
    report(snapshot("playing", "a", 40_000, 1));
    advance(16);
    release();
    advance(16);

    expect(drawn.slice(drawn.indexOf(40_000))).toSatisfy((rest: number[]) =>
      rest.every((ms) => ms >= 40_000),
    );
    expect(clock.position.get()).toBeGreaterThanOrEqual(40_000);
  });

  it("does not announce a slow report as a seek", () => {
    const { clock, report, advance } = setup();
    const jumps: unknown[] = [];
    clock.onJump((jump) => jumps.push(jump));
    report(snapshot("playing", "a", 10_000));
    advance(3_000);
    report(snapshot("playing", "a", 10_200));
    expect(jumps).toEqual([]);
  });

  it("tells listeners about every report", () => {
    const { clock, report } = setup();
    let reports = 0;
    clock.onReport(() => (reports += 1));
    report(snapshot("playing", "a", 0));
    report(snapshot("playing", "a", 250));
    expect(reports).toBe(2);
  });
});
