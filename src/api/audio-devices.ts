import { commands } from "@/bindings";
import type { AudioDeviceListError, AudioOutputDevice } from "@/bindings";

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
