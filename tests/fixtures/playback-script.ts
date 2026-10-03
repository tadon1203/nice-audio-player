import type {
  AudioOutputSelection,
  LibraryTrackSummary,
  PlaybackQueueSnapshot,
  PlaybackSnapshot,
} from "$lib/native";
import type { Native } from "./native-api";
import { playbackIdOf, playbackItemFor, playingSnapshot, queueItemFor } from "./data";

/**
 * The answers a test expects from the backend while it plays `sequence`: each transport command
 * moves along that fixed list and answers with the snapshot a player in that spot would send. The
 * test names the sequence (what the context it starts should resolve to); nothing here decides
 * what a context contains, how a queue is edited, or what a search finds. Queue edits are
 * answered by the tests themselves with `queue({ ... })`.
 */
export function scriptPlayback(native: Native, initialSequence: LibraryTrackSummary[]) {
  let sequence = initialSequence;
  let index = -1;
  let status: "playing" | "paused" = "playing";
  let positionMs = 12_000;
  let seekRevision = 0;
  let volume = 0.72;
  let muted = false;
  let outputSelection: AudioOutputSelection = { kind: "systemDefault" };
  let repeatMode: PlaybackQueueSnapshot["repeatMode"] = "off";
  let shuffleEnabled = false;
  let playbackRevision = 50;
  let queueRevision = 1;
  let upcoming: LibraryTrackSummary[] = [];
  let waveformReady = false;
  let ticker: ReturnType<typeof setInterval> | null = null;

  const current = () => sequence[index]!;

  const queue = (patch: { upcoming?: LibraryTrackSummary[] } = {}): PlaybackQueueSnapshot => {
    if (patch.upcoming !== undefined) upcoming = patch.upcoming;
    const played = sequence.slice(0, Math.max(index, 0));
    return {
      revision: queueRevision,
      current: index < 0 ? null : queueItemFor(current()),
      history: played.slice(-50).map(queueItemFor),
      historyCount: played.length,
      upcoming: upcoming.slice(0, 200).map(queueItemFor),
      upcomingCount: upcoming.length,
      repeatMode,
      shuffleEnabled,
      canRestorePrevious: false,
    };
  };

  const snapshot = (): PlaybackSnapshot =>
    playingSnapshot({
      revision: playbackRevision,
      status,
      item: playbackItemFor(current()),
      positionMs,
      seekRevision,
      volume,
      muted,
      outputSelection,
      canGoPrevious: index > 0,
      canGoNext: index < sequence.length - 1,
    });

  /** A playback change, published as a new revision the way the backend does. */
  const commit = async () => {
    playbackRevision += 1;
    const next = snapshot();
    await native.emit({ event: "playbackStateChanged", payload: next });
    return next;
  };
  const commitQueue = async (patch?: { upcoming?: LibraryTrackSummary[] }) => {
    queueRevision += 1;
    const next = queue(patch);
    await native.emit({ event: "playbackQueueStateChanged", payload: next });
    return next;
  };
  const moveTo = async (target: number) => {
    index = target;
    positionMs = 12_000;
    upcoming = sequence.slice(index + 1);
    await commitQueue();
    return commit();
  };

  native.respond("getPlaybackQueue", () => queue());
  native.respond("getPlaybackQueueWindow", ({ offset, limit }) => ({
    revision: queueRevision,
    offset,
    items: upcoming.slice(offset, offset + Math.min(limit, 200)).map(queueItemFor),
  }));
  native.respond("getPlaybackState", () => (index < 0 ? stopped() : snapshot()));
  native.respond("startPlayback", ({ startTrackId }) => {
    const start =
      startTrackId === null ? 0 : sequence.findIndex((track) => track.id === startTrackId);
    return moveTo(Math.max(0, start));
  });
  native.respond("pausePlayback", () => {
    status = "paused";
    return commit();
  });
  native.respond("resumePlayback", () => {
    status = "playing";
    return commit();
  });
  native.respond("previousPlayback", () => moveTo(Math.max(0, index - 1)));
  native.respond("nextPlayback", () => moveTo(Math.min(sequence.length - 1, index + 1)));
  native.respond("playQueueItem", ({ id }) =>
    moveTo(
      Math.max(
        0,
        sequence.findIndex((track) => track.id === id),
      ),
    ),
  );
  native.respond("seekPlayback", ({ positionMs: to }) => {
    positionMs = to;
    seekRevision += 1;
    return commit();
  });
  native.respond("setPlaybackVolume", ({ volume: to }) => {
    volume = to;
    return commit();
  });
  native.respond("setPlaybackMuted", ({ muted: to }) => {
    muted = to;
    return commit();
  });
  native.respond("setAudioOutputSelection", ({ selection }) => {
    outputSelection = selection;
    return commit();
  });
  native.respond("setPlaybackRepeatMode", ({ mode }) => {
    repeatMode = mode;
    return commitQueue();
  });
  native.respond("setPlaybackShuffle", ({ enabled }) => {
    shuffleEnabled = enabled;
    return commitQueue();
  });
  const waveform = () => {
    const peaks = Array.from({ length: 400 }, (_, bar) =>
      Math.round(40 + 200 * Math.abs(Math.sin(bar / 9))),
    );
    return {
      playbackId: playbackIdOf(playbackItemFor(current())),
      peaks,
      rms: peaks.map((peak) => Math.round(peak * 0.6)),
    };
  };
  native.respond("getPlaybackWaveform", () => (waveformReady && index >= 0 ? waveform() : null));

  const stopped = (): PlaybackSnapshot => ({
    status: "stopped",
    base: { ...snapshotBase(), canGoPrevious: false, canGoNext: false },
    item: null,
  });
  const snapshotBase = () => ({
    revision: playbackRevision,
    volume,
    muted,
    outputSelection,
    canGoPrevious: false,
    canGoNext: false,
  });

  const player = {
    /** Changes what the next `startPlayback` plays: what the test expects its context to hold. */
    setSequence: (next: LibraryTrackSummary[]) => {
      sequence = next;
    },
    /** The queue as it stands, with `upcoming` replaced when a test expects an edit. */
    queue: commitQueue,
    /** Reports the loaded track's position (and nothing else), as the backend's ticks do. */
    reportPosition: (to: number) => {
      positionMs = to;
      return native.emit({
        event: "playbackPositionChanged",
        payload: { playbackId: playbackIdOf(playbackItemFor(current())), positionMs, seekRevision },
      });
    },
    /** Reports a position every 10 ms, 250 ms further each time, until stopped. */
    startTicks: () => {
      if (ticker !== null) return;
      ticker = setInterval(() => {
        if (status === "playing") void player.reportPosition(positionMs + 250).catch(() => {});
      }, 10);
    },
    stopTicks: () => {
      if (ticker !== null) clearInterval(ticker);
      ticker = null;
    },
    /** Makes the waveform available and pushes it, as the backend does when analysis finishes. */
    publishWaveform: async () => {
      waveformReady = true;
      await native.emit({ event: "waveformChanged", payload: waveform() });
    },
  };
  return player;
}
