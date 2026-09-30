import { useEffect, useState } from "react";

const CASCADE_WINDOW_MS = 1_000;

/**
 * Right after shuffle is switched with the panel open, rows settle top to bottom instead of
 * all at once. The new order arrives a moment later, so the flag stays up for a second.
 */
export function useShuffleCascade(shuffleEnabled: boolean, isOpen: boolean): boolean {
  const [shuffleSeen, setShuffleSeen] = useState(shuffleEnabled);
  const [cascading, setCascading] = useState(false);
  if (shuffleSeen !== shuffleEnabled) {
    setShuffleSeen(shuffleEnabled);
    setCascading(isOpen);
  }
  useEffect(() => {
    if (!cascading) return;
    const timer = setTimeout(() => setCascading(false), CASCADE_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [cascading]);
  return cascading;
}
