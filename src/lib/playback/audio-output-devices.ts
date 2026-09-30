import { queryOptions } from "@tanstack/svelte-query";
import { requireNative } from "$lib/native";

/** Output devices, re-read every time the menu that shows them opens (`enabled`). */
export function audioOutputDevicesQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: ["audio-output-devices"],
    queryFn: () => requireNative().listAudioOutputDevices(),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}
