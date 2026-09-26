import { useEffect, useRef } from "react";

/** Scrolls an element back to the top whenever `key` changes, but not on first render. */
export function useScrollTopOnChange(element: HTMLElement | null, key: string) {
  const previousKey = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousKey.current;
    previousKey.current = key;
    if (previous !== null && previous !== key) element?.scrollTo({ top: 0 });
  }, [element, key]);
}
