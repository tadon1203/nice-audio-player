import { invoke } from "@tauri-apps/api/core";

import type { AudioDeviceListError, AudioOutputDevice } from "@/types/audio-devices";

export async function listAudioOutputDevices(): Promise<AudioOutputDevice[]> {
  return invoke<AudioOutputDevice[]>("list_audio_output_devices");
}

export function isAudioDeviceListError(value: unknown): value is AudioDeviceListError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    value.code === "enumerationFailed"
  );
}
