import type { QueryClient } from "@tanstack/svelte-query";
import { applyLibraryEvent } from "$lib/library/events";
import { applyLyricsEvent } from "$lib/lyrics/events";
import { requireNative, type AppEvent } from "$lib/native";
import type { Playback } from "$lib/playback/playback.svelte";
import { applyWaveformEvent } from "$lib/playback/waveform";

type SessionSettings = { load(): Promise<void>; mirrorEvent(event: AppEvent): void };

/** Owns the renderer's single subscription to backend push events. Returns the unsubscribe. */
export function startNativeSession({
  playback,
  settings,
  queryClient,
}: {
  playback: Playback;
  settings: SessionSettings;
  queryClient: QueryClient;
}): () => void {
  void playback.initialize();
  // `settings.load` reports its own failure; boot must not depend on it.
  void settings.load().catch(() => undefined);
  return requireNative().onEvent((event) => {
    playback.acceptEvent(event);
    applyLibraryEvent(queryClient, event);
    applyLyricsEvent(queryClient, event);
    applyWaveformEvent(queryClient, event);
    settings.mirrorEvent(event);
  });
}
