import { commands } from "@/bindings";
import type {
  AudioDeviceListError,
  AudioOutputDevice,
  AudioOutputSelection,
  PlaybackSnapshot,
  SetAudioOutputSelectionError,
} from "@/bindings";
import { isPlaybackSnapshot } from "./audio-files";

export async function listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
  return commands.listAudioOutputDevices();
}

export function isAudioDeviceListError(value: unknown): value is AudioDeviceListError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === "enumerationFailed"
  );
}

export async function setAudioOutputSelection(
  selection: AudioOutputSelection,
): Promise<PlaybackSnapshot> {
  const candidate = selection as unknown;
  if (typeof candidate !== "object" || candidate === null || !("kind" in candidate)) {
    throw new Error("Invalid audio output selection.");
  }
  if (candidate.kind === "systemDefault") {
    if ("deviceId" in candidate) throw new Error("System default cannot contain a device ID.");
  } else if (
    candidate.kind !== "device" ||
    !("deviceId" in candidate) ||
    typeof candidate.deviceId !== "string" ||
    candidate.deviceId.length === 0
  ) {
    throw new Error("Audio output device ID must not be empty.");
  }
  const snapshot = await commands.setAudioOutputSelection(selection);
  if (!isPlaybackSnapshot(snapshot)) throw new Error("Invalid playback snapshot payload.");
  return snapshot;
}

export function isSetAudioOutputSelectionError(
  value: unknown,
): value is SetAudioOutputSelectionError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    [
      "invalidDeviceId",
      "outputDeviceUnavailable",
      "invalidPlaybackState",
      "playbackWorkerUnavailable",
      "taskFailed",
    ].includes(value.code)
  );
}
