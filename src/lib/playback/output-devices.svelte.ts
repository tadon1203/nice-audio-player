import { createQuery } from "@tanstack/svelte-query";
import { audioOutputDevicesQueryOptions } from "./audio-output-devices";

export function createAudioOutputDevices(enabled: () => boolean) {
  return createQuery(() => audioOutputDevicesQueryOptions(enabled()));
}
