// See https://svelte.dev/docs/kit/types#app.d.ts
import type { ArtworkRef } from "$lib/native";

declare global {
  namespace App {
    interface PageState {
      nowPlaying?: boolean;
      /** The album artist whose page an album was opened from, so Back returns there. */
      parentArtist?: string;
      /** The artwork of the tile an album was opened from, shown while its details load. */
      artwork?: ArtworkRef | null;
    }
  }
}

export {};
