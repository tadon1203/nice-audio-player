import { useQuery } from "@tanstack/react-query";
import { nativeApi } from "@/shared/lib/native";

/** Output devices, re-read every time the menu that shows them opens. */
export function useAudioOutputDevices(enabled: boolean) {
  return useQuery({
    queryKey: ["audio-output-devices"],
    queryFn: () => nativeApi().listAudioOutputDevices(),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}
