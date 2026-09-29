import { useCallback } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";

/**
 * Now Playing is a layer over the current location, kept in history state. The location
 * underneath never changes, so the library stays mounted (scroll position included), and
 * Back closes the layer. History state is not retained across navigation, so following a
 * link from inside Now Playing closes it.
 */
export function useNowPlaying() {
  const router = useRouter();
  const isOpen = useLocation({ select: (location) => location.state.nowPlaying === true });

  const open = useCallback(() => {
    if (router.state.location.state.nowPlaying === true) return;
    void router.navigate({
      to: ".",
      search: true,
      state: (previous) => ({ ...previous, nowPlaying: true }),
    });
  }, [router]);

  const close = useCallback(() => {
    if (router.state.location.state.nowPlaying !== true) return;
    if (router.history.canGoBack()) router.history.back();
    else
      void router.navigate({
        to: ".",
        search: true,
        replace: true,
        state: (previous) => ({ ...previous, nowPlaying: false }),
      });
  }, [router]);

  const toggle = useCallback(() => {
    if (router.state.location.state.nowPlaying === true) close();
    else open();
  }, [router, open, close]);

  return { isOpen, open, close, toggle };
}
