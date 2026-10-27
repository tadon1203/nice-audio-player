// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    /** Read and written only by `NowPlaying`. */
    interface PageState {
      nowPlaying?: boolean;
    }
  }
}

export {};
