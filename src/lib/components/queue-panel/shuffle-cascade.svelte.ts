import { untrack } from "svelte";

const CASCADE_WINDOW_MS = 1_000;

/**
 * Right after shuffle is switched with the panel open, rows settle top to bottom instead of all
 * at once. The new order arrives a moment later, so the flag stays up for a second.
 * Construct during component initialization; read `current` where it is shown.
 */
export class ShuffleCascade {
  readonly #shuffleEnabled: () => boolean;
  readonly #isOpen: () => boolean;
  #cascading = $state(false);
  #seen: boolean;
  #timer: ReturnType<typeof setTimeout> | undefined;

  public constructor(shuffleEnabled: () => boolean, isOpen: () => boolean) {
    this.#shuffleEnabled = shuffleEnabled;
    this.#isOpen = isOpen;
    this.#seen = untrack(shuffleEnabled);

    // `$effect` is used because the change comes from a prop getter, which is not an external
    // source that `createSubscriber` can wrap, and the flag must be set in reaction to it.
    $effect(() => {
      const now = this.#shuffleEnabled();
      if (now === this.#seen) return;
      this.#seen = now;
      clearTimeout(this.#timer);
      this.#cascading = untrack(this.#isOpen);
      if (this.#cascading)
        this.#timer = setTimeout(() => (this.#cascading = false), CASCADE_WINDOW_MS);
    });
    $effect(() => (): void => clearTimeout(this.#timer));
  }

  public get current(): boolean {
    return this.#cascading;
  }
}
