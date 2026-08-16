import { listen } from "@tauri-apps/api/event";
import {
  commands,
  type PlaybackQueueMoveDirection,
  type PlaybackQueueSnapshot,
  type PlaybackRepeatMode,
} from "@/bindings";

const repeatModes = { off: true, all: true, one: true } satisfies Record<PlaybackRepeatMode, true>;

export function isPlaybackQueueSnapshot(value: unknown): value is PlaybackQueueSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    isRevision(record.revision) &&
    (record.current === null || isQueueItem(record.current)) &&
    Array.isArray(record.upcoming) &&
    record.upcoming.every(isQueueItem) &&
    typeof record.shuffleEnabled === "boolean" &&
    typeof record.repeatMode === "string" &&
    Object.prototype.hasOwnProperty.call(repeatModes, record.repeatMode)
  );
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isQueueItem(value: unknown): value is PlaybackQueueSnapshot["current"] {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.title === "string" &&
    item.title.length > 0 &&
    (item.artist === null || typeof item.artist === "string") &&
    (item.durationMs === null ||
      (typeof item.durationMs === "number" &&
        Number.isSafeInteger(item.durationMs) &&
        item.durationMs >= 0))
  );
}

async function read(payload: Promise<unknown>): Promise<PlaybackQueueSnapshot> {
  const value = await payload;
  if (!isPlaybackQueueSnapshot(value)) throw new Error("Invalid playback queue payload.");
  return value;
}

export const getPlaybackQueue = () => read(commands.getPlaybackQueue());
export const setPlaybackRepeatMode = (mode: PlaybackRepeatMode) =>
  read(commands.setPlaybackRepeatMode(mode));
export const setPlaybackShuffle = (enabled: boolean) => read(commands.setPlaybackShuffle(enabled));
export const removePlaybackQueueItem = (id: string) => read(commands.removePlaybackQueueItem(id));
export const movePlaybackQueueItem = (id: string, direction: PlaybackQueueMoveDirection) =>
  read(commands.movePlaybackQueueItem(id, direction));
export const clearPlaybackQueue = () => read(commands.clearPlaybackQueue());

export function listenToPlaybackQueue(
  handler: (snapshot: PlaybackQueueSnapshot) => void,
  onInvalid?: () => void,
) {
  return listen<unknown>("playback-queue-state-changed", (event) => {
    if (isPlaybackQueueSnapshot(event.payload)) handler(event.payload);
    else onInvalid?.();
  });
}
