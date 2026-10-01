import { untrack } from "svelte";

const CASCADE_WINDOW_MS = 1_000;

/**
 * Right after shuffle is switched with the panel open, rows settle top to bottom instead of all
 * at once. The new order arrives a moment later, so the flag stays up for a second.
 * Call from component initialization.
 */
export function createShuffleCascade(shuffleEnabled: () => boolean, isOpen: () => boolean) {
  let cascading = $state(false);
  let seen = untrack(shuffleEnabled);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const now = shuffleEnabled();
    if (now === seen) return;
    seen = now;
    clearTimeout(timer);
    cascading = untrack(isOpen);
    if (cascading) timer = setTimeout(() => (cascading = false), CASCADE_WINDOW_MS);
  });
  $effect(() => () => clearTimeout(timer));

  return {
    get current() {
      return cascading;
    },
  };
}
