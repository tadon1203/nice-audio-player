import { useApp } from "#lib/app/app.svelte";

/**
 * Fetches the lyrics of the playing track and the next one ahead of time, so Now Playing knows
 * whether there are any before it opens (its layout depends on it) and a track change does not
 * wait on the file. Construct it while a component initialises; it lives as long as that component.
 */
export class LyricsPrefetchController {
  readonly #app = useApp();

  public constructor() {
    // The playback and the queue are an external store, and each prefetch is a request, not state,
    // so this stays an effect.
    $effect(() => {
      const { player: playback, lyrics, queryClient } = this.#app;
      const currentId = playback.item?.id ?? null;
      const nextId = playback.queue?.upcoming[0]?.id ?? null;
      for (const trackId of [currentId, nextId]) {
        if (trackId !== null) {
          void queryClient.query(lyrics.getTrack(trackId)).catch(() => undefined);
        }
      }
    });
  }
}
