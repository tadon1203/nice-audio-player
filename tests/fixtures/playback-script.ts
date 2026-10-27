import {
  type AudioOutputSelection,
  type PlayerState,
  type TrackListItem,
  type QueueState,
  type QueueWindow,
  type StartedBy,
  UPCOMING_WINDOW,
} from "#lib/native/bindings";
import type { Native } from "./native-api";
import { playbackIdOf, playbackItemFor, playingSnapshot, queueItemFor } from "./data";

/**
 * The backend while it plays `sequence`: each transport command moves along that fixed list, answers
 * whether it was accepted, and pushes the state the backend would send for it. The test names the
 * sequence (what the context it starts should resolve to); nothing here decides what a context
 * contains, how a queue is edited, or what a search finds. Queue edits are pushed by the tests
 * themselves with `queue({ ... })`.
 */
export function scriptPlayback(
  native: Native,
  initialSequence: TrackListItem[],
): {
  setSequence: (next: TrackListItem[]) => void;
  queue: (patch?: { upcoming?: TrackListItem[] }) => Promise<void>;
  finishTrack: () => Promise<void>;
  reportPosition: (to: number) => Promise<void>;
  startTicks: () => void;
  stopTicks: () => void;
  publishWaveform: () => Promise<void>;
} {
  let sequence = initialSequence;
  let index = -1;
  let status: "playing" | "paused" = "playing";
  let positionMs = 12_000;
  let seekCount = 0;
  let volume = 0.72;
  let muted = false;
  let outputSelection: AudioOutputSelection = { kind: "systemDefault" };
  let repeatMode: QueueState["repeatMode"] = "off";
  let shuffleEnabled = false;
  let upcoming: TrackListItem[] = [];
  let queueVersion = 1;
  let startedBy: StartedBy = "jump";
  let ticker: ReturnType<typeof setInterval> | null = null;

  const current = (): TrackListItem => sequence[index]!;

  const queue = (patch: { upcoming?: TrackListItem[] } = {}): QueueState => {
    if (patch.upcoming !== undefined) upcoming = patch.upcoming;
    const played = sequence.slice(0, Math.max(index, 0));
    return {
      version: queueVersion,
      current: index < 0 ? null : queueItemFor(current()),
      history: played.slice(-50).map(queueItemFor),
      upcoming: upcoming.slice(0, UPCOMING_WINDOW).map(queueItemFor),
      upcomingCount: upcoming.length,
      repeatMode,
      shuffleEnabled,
    };
  };

  const snapshot = (): PlayerState =>
    playingSnapshot({
      status,
      item: playbackItemFor(current()),
      startedBy,
      positionMs,
      seekCount,
      volume,
      muted,
      outputSelection,
      canGoPrevious: index > 0,
      canGoNext: index < sequence.length - 1,
    });

  /** A playback change: the backend pushes the whole transport state. */
  const commit = (): Promise<void> => native.publish("player", snapshot());
  /** A queue change: the backend pushes the whole queue, under its next version. */
  const commitQueue = (patch?: { upcoming?: TrackListItem[] }): Promise<void> => {
    queueVersion += 1;
    return native.publish("queue", queue(patch));
  };
  /** A new session at `target`, started the way the backend would say it started. */
  const moveTo = async (target: number, by: StartedBy): Promise<void> => {
    index = target;
    startedBy = by;
    positionMs = 12_000;
    upcoming = sequence.slice(index + 1);
    await commitQueue();
    await commit();
  };

  native.respond("playerQueueWindow", ({ offset, limit }): QueueWindow => ({
    version: queueVersion,
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
    seekCount += 1;
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
  const waveform = (): { playbackId: number; rms: number[] } => {
    const levels = Array.from({ length: 400 }, (_, bar) =>
      Math.round(40 + 200 * Math.abs(Math.sin(bar / 9))),
    );
    return {
      playbackId: playbackIdOf(playbackItemFor(current())),
      rms: levels.map((level) => Math.round(level * 0.6)),
    };
  };

  const player = {
    /** Changes what the next `playerPlay` plays: what the test expects its context to hold. */
    setSequence: (next: TrackListItem[]): void => {
      sequence = next;
    },
    /** The queue as it stands, with `upcoming` replaced when a test expects an edit. */
    queue: commitQueue,
    /** The loaded track ended and the backend moved on by itself (an automatic advance). */
    finishTrack: (): Promise<void> => moveTo(Math.min(sequence.length - 1, index + 1), "auto"),
    /** Reports the loaded track's position (and nothing else), as the backend's ticks do. */
    reportPosition: (to: number): Promise<void> => {
      positionMs = to;
      return native.send({
        kind: "position",
        value: {
          playbackId: playbackIdOf(playbackItemFor(current())),
          positionMs,
          seekCount,
        },
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
