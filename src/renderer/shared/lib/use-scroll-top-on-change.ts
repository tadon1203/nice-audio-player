import { useEffect, useRef, type RefObject } from "react";

/** Scrolls an element back to the top whenever `key` changes, but not on first render. */
export function useScrollTopOnChange(ref: RefObject<HTMLElement | null>, key: string) {
  const previousKey = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousKey.current;
    previousKey.current = key;
    if (previous !== null && previous !== key) ref.current?.scrollTo({ top: 0 });
  }, [ref, key]);
}
