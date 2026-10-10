import type { QueryClient } from "@tanstack/svelte-query";
import type { LibraryScanState } from "$lib/library/library-scan-state.svelte";
import { requireNative, type BackendMessage } from "$lib/native";
import type { Playback } from "$lib/playback/playback.svelte";
import { applyWaveform } from "$lib/playback/waveform";
import type { Settings } from "$lib/settings/settings.svelte";
import { countE2e } from "./e2e-counts";
import { createScanWatcher } from "./scan-finished";

/**
 * Owns the renderer's one channel to the backend. Applies the state `connect` returns, then every
 * message on the channel, in order. A message that arrives before `connect` answers waits for it,
 * so the initial state is never applied over a newer message.
 */
export function startNativeSession({
  playback,
  settings,
  libraryScan,
  queryClient,
}: {
  playback: Playback;
  settings: Settings;
  libraryScan: LibraryScanState;
  queryClient: QueryClient;
}): void {
  const watchScan = createScanWatcher(queryClient, libraryScan);

  const apply = (message: BackendMessage) => {
    if (message.kind === "position") {
      playback.acceptPosition(message);
      return;
    }
    // Occurrences have no consumer yet.
    if (message.kind === "occurrence") return;
    switch (message.topic) {
      case "playback":
        playback.acceptPlayback(message.value);
        return;
      case "queue":
        playback.acceptQueue(message.value);
        return;
      case "libraryScan":
        watchScan(message.value);
        return;
      case "waveform":
        if (message.value !== null) applyWaveform(queryClient, message.value);
        return;
      case "appearance":
        settings.accept(message.value);
        return;
    }
  };

  countE2e("connects");
  let early: BackendMessage[] | null = [];
  requireNative()
    .connect((message) => {
      if (message.kind === "state") countE2e("stateMessages");
      if (early === null) apply(message);
      else early.push(message);
    })
    .then(
      (initial) => {
        playback.initialize(initial.playback.value, initial.queue.value);
        settings.accept(initial.appearance.value);
        watchScan(initial.libraryScan.value);
        if (initial.waveform.value !== null) applyWaveform(queryClient, initial.waveform.value);
        for (const message of early ?? []) apply(message);
        early = null;
      },
      (error: unknown) => {
        early = null;
        playback.initializeFailed(error);
        settings.initializeFailed(error);
      },
    );
}
