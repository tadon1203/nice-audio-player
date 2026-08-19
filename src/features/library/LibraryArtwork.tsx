import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ArtworkRef } from "@/bindings";
import { resolveArtworkUrl } from "@/lib/artwork-url";
import { effectsMotion } from "@/lib/motion";

const artworkUrlCache = new WeakMap<object, Promise<string | null>>();

export function useLibraryArtworkUrl(artwork: ArtworkRef | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!artwork) {
      queueMicrotask(() => {
        if (active) setUrl(null);
      });
      return () => {
        active = false;
      };
    }
    const pending = artworkUrlCache.get(artwork) ?? resolveArtworkUrl(artwork);
    artworkUrlCache.set(artwork, pending);
    void pending.then((next) => active && setUrl(next)).catch(() => active && setUrl(null));
    return () => {
      active = false;
    };
  }, [artwork]);
  return url;
}

export function LibraryArtwork({
  artwork,
  className,
  resolvedUrl,
}: {
  artwork: ArtworkRef | null;
  className?: string;
  resolvedUrl?: string | null;
}) {
  const resolvedArtworkUrl = useLibraryArtworkUrl(artwork);
  const url = resolvedUrl === undefined ? resolvedArtworkUrl : resolvedUrl;
  const reducedMotion = useReducedMotion();
  const transition = {
    duration: reducedMotion ? effectsMotion.reduced : effectsMotion.image,
    ease: effectsMotion.ease,
  };
  return (
    <span className="library-artwork-transition">
      <AnimatePresence initial={false}>
        {url ? (
          <motion.img
            key={url}
            className={`library-view__artwork ${className ?? ""}`}
            src={url}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          />
        ) : (
          <motion.span
            key="placeholder"
            className={`library-view__artwork library-view__artwork--placeholder ${className ?? ""}`}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          />
        )}
      </AnimatePresence>
    </span>
  );
}
