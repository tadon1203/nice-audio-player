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
  const devices: unknown = await commands.listAudioOutputDevices();
  if (!Array.isArray(devices) || !devices.every(isAudioOutputDevice)) {
    throw new Error("Invalid audio output device payload.");
  }
  return devices;
}

function isAudioOutputDevice(value: unknown): value is AudioOutputDevice {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    typeof record.name === "string" &&
    record.name.length > 0 &&
    typeof record.isDefault === "boolean"
  );
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
