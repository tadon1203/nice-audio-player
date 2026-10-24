import {
  type AudioOutputSelection,
  type TrackRow,
  type QueueState,
  type PlaybackState,
  type StartedBy,
  type Revisioned,
} from "#lib/native/bindings";
import type { Native } from "./native-api";
import { playbackIdOf, playbackItemFor, playingSnapshot, queueItemFor } from "./data";

/**
 * The answers a test expects from the backend while it plays `sequence`: each transport command
 * moves along that fixed list and answers with the snapshot a player in that spot would send. The
 * test names the sequence (what the context it starts should resolve to); nothing here decides
 * what a context contains, how a queue is edited, or what a search finds. Queue edits are
 * answered by the tests themselves with `queue({ ... })`.
 */
export function scriptPlayback(
  native: Native,
  initialSequence: TrackRow[],
): {
  setSequence: (next: TrackRow[]) => void;
  queue: (patch?: { upcoming?: TrackRow[] }) => Promise<Revisioned<QueueState>>;
  finishTrack: () => Promise<Revisioned<PlaybackState>>;
  reportPosition: (to: number) => Promise<void>;
  startTicks: () => void;
  stopTicks: () => void;
  publishWaveform: () => Promise<void>;
} {
  let sequence = initialSequence;
  let index = -1;
  let status: "playing" | "paused" = "playing";
  let positionMs = 12_000;
  let seekRevision = 0;
  let volume = 0.72;
  let muted = false;
  let outputSelection: AudioOutputSelection = { kind: "systemDefault" };
  let repeatMode: QueueState["repeatMode"] = "off";
  let shuffleEnabled = false;
  let upcoming: TrackRow[] = [];
  let startedBy: StartedBy = "jump";
  let ticker: ReturnType<typeof setInterval> | null = null;

  const current = (): TrackRow => sequence[index]!;

  const queue = (patch: { upcoming?: TrackRow[] } = {}): QueueState => {
    if (patch.upcoming !== undefined) upcoming = patch.upcoming;
    const played = sequence.slice(0, Math.max(index, 0));
    return {
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

  const snapshot = (): PlaybackState =>
    playingSnapshot({
      status,
      item: playbackItemFor(current()),
      startedBy,
      positionMs,
      seekRevision,
      volume,
      muted,
      outputSelection,
      canGoPrevious: index > 0,
      canGoNext: index < sequence.length - 1,
    });

  /** A playback change, published as a new revision the way the backend does; the answer carries it. */
  const commit = async (): Promise<Revisioned<PlaybackState>> => {
    const value = snapshot();
    const revision = await native.publish("playback", value);
    return { revision, value };
  };
  const commitQueue = async (patch?: {
    upcoming?: TrackRow[];
  }): Promise<Revisioned<QueueState>> => {
    const value = queue(patch);
    const revision = await native.publish("queue", value);
    return { revision, value };
  };
  /** A new session at `target`, started the way the backend would say it started. */
  const moveTo = async (target: number, by: StartedBy): Promise<Revisioned<PlaybackState>> => {
    index = target;
    startedBy = by;
    positionMs = 12_000;
    upcoming = sequence.slice(index + 1);
    await commitQueue();
    return commit();
  };

  native.respond("playerQueueWindow", ({ offset, limit }) => ({
    revision: native.revisionOf("queue"),
    offset,
    items: upcoming.slice(offset, offset + Math.min(limit, 200)).map(queueItemFor),
  }));
  native.respond("playerPlay", ({ startTrackId }) => {
    const start =
      startTrackId === null ? 0 : sequence.findIndex((track) => track.id === startTrackId);
    return moveTo(Math.max(0, start), "jump");
  });
  native.respond("playerPause", () => {
    status = "paused";
    return commit();
  });
  native.respond("playerResume", () => {
    status = "playing";
    return commit();
  });
  native.respond("playerPrevious", () => moveTo(Math.max(0, index - 1), "previous"));
  native.respond("playerNext", () => moveTo(Math.min(sequence.length - 1, index + 1), "next"));
  native.respond("playerPlayQueueItem", ({ id }) =>
    moveTo(
      Math.max(
        0,
        sequence.findIndex((track) => track.id === id),
      ),
      "jump",
    ),
  );
  native.respond("playerSeek", ({ positionMs: to }) => {
    positionMs = to;
    seekRevision += 1;
    return commit();
  });
  native.respond("playerSetVolume", ({ volume: to }) => {
    volume = to;
    return commit();
  });
  native.respond("playerSetMuted", ({ muted: to }) => {
    muted = to;
    return commit();
  });
  native.respond("playerSetOutputSelection", ({ selection }) => {
    outputSelection = selection;
    return commit();
  });
  native.respond("playerSetRepeatMode", ({ mode }) => {
    repeatMode = mode;
    return commitQueue();
  });
  native.respond("playerSetShuffle", ({ enabled }) => {
    shuffleEnabled = enabled;
    return commitQueue();
  });
  const waveform = (): { playbackId: number; peaks: number[]; rms: number[] } => {
    const peaks = Array.from({ length: 400 }, (_, bar) =>
      Math.round(40 + 200 * Math.abs(Math.sin(bar / 9))),
    );
    return {
      playbackId: playbackIdOf(playbackItemFor(current())),
      peaks,
      rms: peaks.map((peak) => Math.round(peak * 0.6)),
    };
  };

  const player = {
    /** Changes what the next `playerPlay` plays: what the test expects its context to hold. */
    setSequence: (next: TrackRow[]): void => {
      sequence = next;
    },
    /** The queue as it stands, with `upcoming` replaced when a test expects an edit. */
    queue: commitQueue,
    /** The loaded track ended and the backend moved on by itself (an automatic advance). */
    finishTrack: (): Promise<Revisioned<PlaybackState>> =>
      moveTo(Math.min(sequence.length - 1, index + 1), "auto"),
    /** Reports the loaded track's position (and nothing else), as the backend's ticks do. */
    reportPosition: (to: number): Promise<void> => {
      positionMs = to;
      return native.send({
        kind: "position",
        playbackId: playbackIdOf(playbackItemFor(current())),
        positionMs,
        seekRevision,
      });
    },
    /** Reports a position every 10 ms, 250 ms further each time, until stopped. */
    startTicks: (): void => {
      if (ticker !== null) return;
      ticker = setInterval(() => {
        if (status === "playing") void player.reportPosition(positionMs + 250).catch(() => {});
      }, 10);
    },
    stopTicks: (): void => {
      if (ticker !== null) clearInterval(ticker);
      ticker = null;
    },
    /** Makes the waveform available and pushes it, as the backend does when analysis finishes. */
    publishWaveform: async (): Promise<void> => {
      await native.publish("waveform", waveform());
    },
  };
  return player;
}
