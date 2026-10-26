import type { Snapshot } from "@sveltejs/kit";

/**
 * Scroll positions for the workspace. Library lists are keyed by path: leaving Albums for Tracks
 * and coming back lands where the user was. Detail pages are keyed by history entry instead
 * (SvelteKit's `snapshot`), because the same album opened twice is two different visits.
 */
export class ScrollMemory {
  readonly #lists = new Map<string, number>();

  public rememberList(path: string, offset: number): void {
    this.#lists.set(path, offset);
  }

  /** 0 (the top) for a view that has never been scrolled. */
  public recallList(path: string): number {
    return this.#lists.get(path) ?? 0;
  }

  /** For SvelteKit `snapshot` on a detail page: `read` leaves the entry, `write` returns to it. */
  public detailSnapshot(read: () => number, write: (offset: number) => void): Snapshot<number> {
    return { capture: read, restore: write };
  }
}
