// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    interface PageState {
      nowPlaying?: boolean;
      parentArtist?: string;
      artwork?: string;
    }
  }
}

export {};
