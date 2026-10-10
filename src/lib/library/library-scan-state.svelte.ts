import type { LibraryScanSnapshot } from "$lib/native";

/** The Library scan as the backend last reported it; `null` until the first report arrives. */
export class LibraryScanState {
  snapshot = $state.raw<LibraryScanSnapshot | null>(null);
}
